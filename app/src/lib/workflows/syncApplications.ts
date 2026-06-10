// A2 — Application status sync from Gmail → Applications table.
// Port of _instructions_update_applications.md. Code does the mechanical work
// (Gmail search, anchor rule, dedup, monotonic status); the LLM classifies each
// email by its actual content (the SOP's core judgment step + exclusions).
// Hobby-bounded: processes up to `maxItems` threads per invocation; idempotent,
// so re-running to cover the rest is safe.
import { searchMessageIds, getMessage } from "./gmail";
import { callClaude, parseJsonObject } from "./llm";
import { normalizeCompany, isH1bSponsor, canonicalJobKey, roleKey } from "./filters";
import {
  listApplications,
  listInterviews,
  listLeads,
  listJobListings,
  createRecords,
  updateRecords,
  TABLES,
  FIELDS,
  primaryBase,
} from "@/lib/airtable";
import type { RunResult } from "./runLog";
import type { JobListing } from "@/lib/types";

// Full-text (not subject-only) queries, verbatim from the SOP. 45-day window.
const QUERIES = [
  '("thank you for applying" OR "application received" OR "we received your application" OR "thanks for your interest" OR "successfully submitted") newer_than:45d',
  '("regret to inform" OR "not moving forward" OR "will not be moving forward" OR "decided to move forward with other" OR "move forward with other candidates" OR "pursue other candidates" OR "not selected" OR "decided not to proceed" OR "not be progressing" OR "unable to offer") newer_than:45d',
  '(interview OR "phone screen" OR "technical screen" OR "schedule a time" OR "set up a call") newer_than:45d',
  '("offer of employment" OR "offer letter" OR "pleased to extend" OR "extend an offer" OR "pleased to offer you" OR "formal offer") newer_than:45d',
];

const SYSTEM = `You classify ONE email from a data engineer's job-search inbox. Decide the application status it represents, classifying by the email's actual content — NOT by keywords that merely appear.

Return ONLY a JSON object:
{"is_job_application": boolean, "company": string, "role": string, "status": "submitted"|"interviewing"|"offered"|"rejected"|"none", "interview_stage": string, "confidence": number}

Rules:
- "submitted": application received/confirmation only.
- "interviewing": an interview is being scheduled/invited, or feedback between rounds. Set interview_stage if named (e.g. "Recruiter Screen", "Technical Screen", "Onsite").
- "offered": a genuine job offer of employment.
- "rejected": not moving forward / other candidates / not selected.
- "none": anything that is NOT a real job-application email.
- company = the hiring company (from sender domain or signature), not a job board.

EXCLUDE (set is_job_application=false, status="none"):
- The candidate's OWN employer HR/layoff/leadership mail (e.g. @meta.com, DocuSign headcount letters).
- Service-provider mail: immigration (e.g. Fragomen "pleased to offer you access"), banking, travel/booking/apartment ("regret to inform … booking cancelled").
- Promotional/transactional senders (noreply marketing, points, rewards, deals, retail "offers").
A confirmation email may contain boilerplate like "other candidates" — that does NOT make it a rejection. Read the intent.`;

interface Classification {
  is_job_application: boolean;
  company: string;
  role: string;
  status: "submitted" | "interviewing" | "offered" | "rejected" | "none";
  interview_stage?: string;
  confidence: number;
}

const STATUS_RANK: Record<string, number> = {
  submitted: 1,
  ghosted: 1,
  interviewing: 2,
  offered: 3,
  rejected: 3,
};

// Monotonic: never regress a later state to an earlier one. Exported for tests.
export function shouldAdvance(current: string | undefined, next: string): boolean {
  if (!current) return true;
  if (current === next) return false;
  return (STATUS_RANK[next] ?? 0) >= (STATUS_RANK[current] ?? 0);
}

function slug(s: string): string {
  return (s || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "x";
}

function isoDate(d: string): string {
  const t = new Date(d);
  return isNaN(t.getTime()) ? new Date().toISOString().slice(0, 10) : t.toISOString().slice(0, 10);
}

// Pre-apply listing states an application may advance past. "skipped"/"applied"
// (and post-apply states) are left as-is — never regressed or overridden.
const PRE_APPLY = new Set(["new", "queued", "approved"]);

// Propagate an application onto the scraped Job_Listings row it came from:
// advance that row to "applied" so the Listings page reflects reality. Matches
// by job URL when known, else company + title slug (precise enough not to mark
// a different listing at the same company). Monotonic; returns true if updated.
async function markListingApplied(
  listings: JobListing[],
  company: string,
  role: string,
  jobUrl: string | undefined,
  dryRun: boolean,
): Promise<boolean> {
  // Match by job URL when known, else by shared role identity (company + Sr./Jr.-
  // normalized title) so an email's "Sr. Data Engineer" matches a "Senior Data
  // Engineer" listing at the same company.
  const rk = roleKey(company, role);
  const urlKey = jobUrl ? canonicalJobKey(jobUrl).key : "";
  const match = listings.find((l) => {
    if (l.status && !PRE_APPLY.has(l.status)) return false; // already applied/skipped/etc.
    if (urlKey && l.url && canonicalJobKey(l.url).key === urlKey) return true;
    return roleKey(l.company, l.title) === rk;
  });
  if (!match) return false;
  if (!dryRun) {
    await updateRecords(TABLES.jobListings, primaryBase(), [
      { id: match.id, fields: { [FIELDS.jobListings.status]: "applied" } },
    ]);
  }
  match.status = "applied"; // keep local view consistent within this run
  return true;
}

export async function syncApplications(
  opts: { maxItems?: number; dryRun?: boolean; offset?: number; cursor?: { offset?: number } } = {},
): Promise<RunResult> {
  const max = opts.maxItems ?? 3; // Hobby ~10s cap → small batch; chunk-loop covers the rest
  const offset = opts.cursor?.offset ?? opts.offset ?? 0;
  const dryRun = Boolean(opts.dryRun);

  // 1. Gather candidate threads across the 4 queries, deduped by threadId.
  //    Order is date-stable across calls, so the offset cursor advances cleanly.
  const seen = new Set<string>();
  const candidates: Array<{ id: string; threadId: string }> = [];
  for (const q of QUERIES) {
    for (const m of await searchMessageIds(q, 15)) {
      if (!seen.has(m.threadId)) {
        seen.add(m.threadId);
        candidates.push(m);
      }
    }
  }
  const batch = candidates.slice(offset, offset + max);

  // 2. Build pipeline-scope set (allowlist OR already-referenced company).
  //    Listings read fresh so the "applied" propagation sees current statuses.
  const [apps, interviews, leads, listings] = await Promise.all([
    listApplications(),
    listInterviews(),
    listLeads(),
    listJobListings({ fresh: true }),
  ]);
  const pipeline = new Set<string>();
  for (const a of apps) pipeline.add(normalizeCompany(a.company));
  for (const i of interviews) pipeline.add(normalizeCompany(i.company));
  for (const l of leads) pipeline.add(normalizeCompany(l.company));

  // Existing apps keyed by company::roleToken for dedup.
  const appKey = (company: string, role: string) => `${normalizeCompany(company)}::${slug(role)}`;
  const byKey = new Map<string, (typeof apps)[number]>();
  for (const a of apps) byKey.set(appKey(a.company, a.jobTitle || ""), a);

  let classified = 0,
    created = 0,
    updated = 0,
    skipped = 0,
    listingsApplied = 0;

  for (const c of batch) {
    const msg = await getMessage(c.id);
    const reply = await callClaude({
      system: SYSTEM,
      user: `From: ${msg.from}\nSubject: ${msg.subject}\nDate: ${msg.date}\n\n${msg.body}`,
      maxTokens: 250,
    });
    classified++;
    const cls = parseJsonObject<Classification>(reply);
    if (!cls || !cls.is_job_application || cls.status === "none" || !cls.company) {
      skipped++;
      continue;
    }
    // Anchor rule (pipeline-scope): allowlist OR already in pipeline.
    const norm = normalizeCompany(cls.company);
    if (!isH1bSponsor(cls.company) && !pipeline.has(norm)) {
      skipped++;
      continue;
    }

    // Reflect the application on its scraped listing (e.g. new → applied). Done
    // independently of the Application's monotonic update below — the listing can
    // still be "new" even when the application row is already "submitted".
    if (await markListingApplied(listings, cls.company, cls.role || "", undefined, dryRun)) {
      listingsApplied++;
    }

    const key = appKey(cls.company, cls.role || "");
    const existing = byKey.get(key) ?? apps.find((a) => normalizeCompany(a.company) === norm);

    if (existing) {
      if (!shouldAdvance(existing.status, cls.status)) {
        skipped++;
        continue;
      }
      const fields: Record<string, unknown> = { [FIELDS.applications.status]: cls.status };
      if (cls.status === "interviewing" && cls.interview_stage) {
        fields[FIELDS.applications.interviewStage] = cls.interview_stage;
      }
      if (!dryRun) await updateRecords(TABLES.applications, primaryBase(), [{ id: existing.id, fields }]);
      existing.status = cls.status; // keep local view monotonic within this run
      updated++;
    } else {
      const fields: Record<string, unknown> = {
        [FIELDS.applications.applicationId]: `${slug(cls.company)}-${slug(cls.role || "de")}-${isoDate(msg.date).replace(/-/g, "")}`,
        [FIELDS.applications.company]: cls.company,
        [FIELDS.applications.jobTitle]: cls.role || "Data Engineer",
        [FIELDS.applications.status]: cls.status,
        [FIELDS.applications.submittedAt]: isoDate(msg.date),
      };
      if (cls.status === "interviewing" && cls.interview_stage) {
        fields[FIELDS.applications.interviewStage] = cls.interview_stage;
      }
      if (!dryRun) {
        const [rec] = await createRecords(TABLES.applications, primaryBase(), [fields]);
        // Track within this run so a later email for the same company updates, not duplicates.
        const tracked = { id: rec.id, applicationId: "", company: cls.company, jobTitle: cls.role || "", status: cls.status } as (typeof apps)[number];
        byKey.set(key, tracked);
        apps.push(tracked);
      }
      created++;
    }
  }

  const nextOffset = offset + batch.length;
  const remaining = Math.max(0, candidates.length - nextOffset);
  return {
    counts: { candidates: candidates.length, classified, created, updated, skipped, listingsApplied, remaining, nextOffset },
    partial: remaining > 0,
    cursor: { offset: nextOffset },
    notes:
      `${dryRun ? "[DRY RUN] " : ""}processed ${batch.length} (${nextOffset}/${candidates.length})` +
      (listingsApplied ? `, ${listingsApplied} listing(s)→applied` : "") +
      (remaining > 0 ? ` — ${remaining} remaining` : ""),
  };
}
