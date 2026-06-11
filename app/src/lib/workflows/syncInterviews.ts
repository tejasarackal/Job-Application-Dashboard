// A3 — Interview sync from Gmail → Interviews table.
// Port of _instructions_gmail_scrape_interviews.md. Identity is a single
// interview RELATIONSHIP keyed on (company, role, interviewer) — NOT (company,
// stage): stage is a per-round attribute that advances, so keying on it created
// one row per email-variation (see BUG-024). The LLM extracts free-text fields;
// `role` is healed against the Applications table (authoritative titles) so the
// key is stable and never the fabricated "Data Engineer" default. `stage` is
// always one of a fixed canonical set (generic "Interview" when no round type is
// detected) so the single-select never accumulates junk via typecast.
import { searchMessageIds, getMessage } from "./gmail";
import { callClaude, parseJsonObject } from "./llm";
import { normalizeCompany, isH1bSponsor } from "./filters";
import {
  listInterviews,
  listApplications,
  listLeads,
  createRecords,
  updateRecords,
  withOwner,
  TABLES,
  FIELDS,
  primaryBase,
} from "@/lib/airtable";
import type { RunResult } from "./runLog";
import type { Interview } from "@/lib/types";

const QUERIES = [
  '(interview OR "phone screen" OR "technical screen" OR "onsite" OR "video conference interview" OR "schedule your interview" OR "interview invitation" OR "meet the team") newer_than:45d',
  '((zoom.us OR meet.google.com OR teams.microsoft.com OR calendly.com) AND (interview OR "phone screen" OR recruiter OR "the role" OR "the position")) newer_than:45d',
  '("thank you for your time" OR "update on your application" OR "next steps" OR "decision on your" OR "next round" OR "moving forward" OR "regret to inform" OR "not moving forward") newer_than:45d',
];

const SYSTEM = `You extract interview details from ONE email in a data engineer's job-search inbox.
Return ONLY JSON:
{"is_interview": boolean, "company": string, "role": string, "interviewer": string, "interviewer_title": string, "recruiter": string, "call_link": string, "status": "Scheduled"|"Awaiting Feedback"|"Passed"|"Rejected"|"Cancelled"|"Completed", "scheduled_at": string, "stage_hint": string}

- is_interview=true only for a genuine interview invite/scheduling/feedback tied to a job application. A rejection/decision email for an application that never reached an interview is NOT an interview (set is_interview=false); treat a rejection as interview-related only if it references an interview that actually took place (e.g. "after your onsite").
- EXCLUDE trial-signup/newsletter "next steps", webinars, the candidate's own-employer mail, and service-provider notices (set is_interview=false).
- role = the EXACT job title as written in the email (e.g. "Data Engineer, People Analytics", "Business Intelligence Analyst"). If the email does not state a role, return "" — do NOT guess or use a generic title like "Data Engineer".
- interviewer = the person who will CONDUCT the interview (often named in the body), NOT the recruiter/coordinator who only schedules it. If none is clearly the interviewer, return "".
- recruiter = the recruiter/coordinator/talent-acquisition person who scheduled it, if named, else "".
- call_link = first Zoom/Meet/Teams/Calendly URL, else "".
- scheduled_at = ISO 8601 datetime if a specific time is given, else "".
- status: Scheduled (future/confirmed), Awaiting Feedback (done, no result), Passed/Rejected/Cancelled/Completed as stated.
- stage_hint = the interview ROUND TYPE only, one of: recruiter screen, technical screen, hiring manager, system design, take-home, behavioral, onsite, offer — or "" if unclear. Do NOT put modality (virtual/Teams/Zoom/phone), confirmation status, or scheduling chatter here.
- company from sender domain/signature (not a job board).`;

interface Extract {
  is_interview: boolean;
  company: string;
  role: string;
  interviewer: string;
  interviewer_title: string;
  recruiter: string;
  call_link: string;
  status: string;
  scheduled_at: string;
  stage_hint: string;
}

// ── Canonical stages ──────────────────────────────────────────────────────────
// The ONLY values ever written to the stage single-select. "Interview" is the
// generic fallback when no specific round type is detected (keeps the dropdown
// from accumulating modality/confirmation free-text via typecast).
export const STAGES = [
  "Recruiter Screen",
  "Technical Screen",
  "Take Home",
  "Hiring Manager",
  "System Design",
  "Behavioral",
  "Onsite / Final",
  "Offer",
  "Interview",
] as const;

// Deterministic round-type map (most-specific first) — from the SOP keyword
// table. Returns "" when no specific round type matches; the caller then uses the
// generic "Interview". Modality words (virtual/zoom/teams) are intentionally NOT
// stages.
export function mapStage(text: string): string {
  const s = text.toLowerCase();
  if (/\bhm\b|hiring manager|fit call|fit chat/.test(s)) return "Hiring Manager";
  if (/prescreen|pre-screen|recruiter|phone screen|intro call|initial call|screening/.test(s)) return "Recruiter Screen";
  if (/technical|tech screen|coding|live coding|\bdsa\b|pairing/.test(s)) return "Technical Screen";
  if (/system design|architecture|design round/.test(s)) return "System Design";
  if (/take[ -]?home|assessment|exercise|hackerrank|coderpad/.test(s)) return "Take Home";
  if (/behavioral|values|culture|leadership principles/.test(s)) return "Behavioral";
  if (/onsite|final round|\bloop\b|panel/.test(s)) return "Onsite / Final";
  if (/\boffer\b/.test(s)) return "Offer";
  return "";
}

// ── Normalization (for the dedup key + role healing) ──────────────────────────
export function normalizeRole(role: string | undefined): string {
  return (role ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // drop "(R2519741)", "(L5)", req ids
    .replace(/[^a-z0-9 ]/g, " ") // commas/slashes/dashes → space
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeInterviewer(name: string | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Two roles are "the same" if equal, either is blank, or one normalized string
// contains the other ("data engineer" ⊆ "data engineer people analytics") — so a
// generic extraction doesn't split from the specific pipeline title.
export function roleCompat(a: string | undefined, b: string | undefined): boolean {
  const na = normalizeRole(a);
  const nb = normalizeRole(b);
  if (!na || !nb || na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

const isUnknownTitle = (t: string) => /unknown\b|unknown —|see .*(gmail|email|thread)/i.test(t);

// Resolve the role to an authoritative Applications title when possible; never
// fabricate a default. Empty extraction + a single known role → use it; multiple
// → leave blank (findExisting heals it from a same-event/same-person sibling).
export function resolveRole(
  company: string,
  extracted: string | undefined,
  apps: Array<{ company: string; jobTitle?: string }>,
): string {
  const nc = normalizeCompany(company);
  const candidates = apps
    .filter((a) => normalizeCompany(a.company) === nc)
    .map((a) => (a.jobTitle ?? "").trim())
    .filter((t) => t && !isUnknownTitle(t));
  const ex = (extracted ?? "").trim();
  if (ex) {
    return candidates.find((c) => roleCompat(c, ex)) ?? ex; // authoritative title, else verbatim
  }
  return candidates.length === 1 ? candidates[0] : "";
}

// Keep the more specific of two compatible roles (longer normalized wins).
function pickRole(a: string | undefined, b: string | undefined): string {
  const A = (a ?? "").trim();
  const B = (b ?? "").trim();
  if (!A) return B;
  if (!B || !roleCompat(A, B)) return A;
  return normalizeRole(B).length > normalizeRole(A).length ? B : A;
}

const sameDate = (a?: string, b?: string): boolean => Boolean(a && b && a.slice(0, 10) === b.slice(0, 10));

// Find the existing interview this email belongs to. One interview RELATIONSHIP
// per (company, role, interviewer); a few fallbacks heal the messy real-world
// cases (recruiter named instead of interviewer; generic vs specific role).
export function findExisting(
  rows: Interview[],
  company: string,
  role: string,
  interviewer: string,
  scheduledAt: string,
): Interview | undefined {
  const nc = normalizeCompany(company);
  const ni = normalizeInterviewer(interviewer);
  const inCo = rows.filter((r) => normalizeCompany(r.company) === nc);
  // (a) same interviewer + compatible role — the clean case.
  if (ni) {
    const m = inCo.find((r) => normalizeInterviewer(r.interviewer) === ni && roleCompat(r.role, role));
    if (m) return m;
  }
  // (b) same event: compatible role + same scheduled date — collapses a recruiter
  //     email and the interviewer email for the same slot (Sasha Pan ↔ Corey Hart).
  if (scheduledAt) {
    const m = inCo.find((r) => sameDate(r.scheduledAt, scheduledAt) && roleCompat(r.role, role));
    if (m) return m;
  }
  // (c) same person at the company, role-agnostic — heals a confidently-wrong
  //     role extraction for someone we already track.
  if (ni) {
    const m = inCo.find((r) => normalizeInterviewer(r.interviewer) === ni);
    if (m) return m;
  }
  // (d) same role with no interviewer on one side.
  const nr = normalizeRole(role);
  if (nr) {
    const m = inCo.find((r) => normalizeRole(r.role) === nr && (!normalizeInterviewer(r.interviewer) || !ni));
    if (m) return m;
  }
  return undefined;
}

const STATUS_RANK: Record<string, number> = {
  Scheduled: 1,
  "Awaiting Feedback": 2,
  Completed: 3,
  Passed: 3,
  Rejected: 3,
  Cancelled: 3,
};
export function shouldAdvance(current: string | undefined, next: string): boolean {
  if (!current) return true;
  if (current === next) return false;
  return (STATUS_RANK[next] ?? 0) >= (STATUS_RANK[current] ?? 0);
}

// A NEW interview row is only justified by evidence an interview exists/occurred:
// a scheduled time, a named interviewer, a specific round, or a forward-looking
// "Scheduled" status. A bare terminal status (Rejected/Cancelled/…) with none of
// these is a screening decision — it belongs on the Application (syncApplications
// records it), not as a fabricated interview row (see BUG-025). Gating only the
// CREATE path preserves real post-interview rejections, which UPDATE an existing row.
export function isRealInterviewEvidence(
  status: string,
  scheduledAt: string,
  interviewer: string,
  stage: string,
): boolean {
  if (scheduledAt) return true;
  if (interviewer.trim()) return true;
  if (stage && stage !== "Interview") return true; // a specific round was detected
  return status === "Scheduled"; // forward-looking invite
}

// One-line metadata for the notes field — records the recruiter (so the
// interviewer/recruiter distinction isn't lost) without polluting the stage.
function buildMeta(ex: Extract, dateIso: string): string {
  const bits: string[] = [];
  if (ex.recruiter) bits.push(`recruiter: ${ex.recruiter}`);
  if (!bits.length) return "";
  const d = (dateIso || "").slice(0, 10);
  return `${d ? `[${d}] ` : ""}${bits.join("; ")}`;
}

function appendNote(existing: string | undefined, meta: string): string {
  if (!meta) return existing ?? "";
  if (!existing) return meta;
  if (existing.includes(meta)) return existing; // idempotent on re-sync
  return `${existing}\n${meta}`;
}

export async function syncInterviews(
  opts: { ownerEmail: string; maxItems?: number; dryRun?: boolean; offset?: number; cursor?: { offset?: number } },
): Promise<RunResult> {
  const ownerEmail = opts.ownerEmail; // engine identity (PRD §5.6)
  const max = opts.maxItems ?? 3; // Hobby ~10s cap → small batch; chunk-loop covers the rest
  const offset = opts.cursor?.offset ?? opts.offset ?? 0;
  const dryRun = Boolean(opts.dryRun);
  const today = new Date().toISOString().slice(0, 10);

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

  const [interviews, apps, leads] = await Promise.all([
    listInterviews(ownerEmail),
    listApplications(ownerEmail),
    listLeads(ownerEmail),
  ]);
  const pipeline = new Set<string>();
  for (const i of interviews) pipeline.add(normalizeCompany(i.company));
  for (const a of apps) pipeline.add(normalizeCompany(a.company));
  for (const l of leads) pipeline.add(normalizeCompany(l.company));

  // Mutable working set: existing rows + rows created this run, so a later email
  // in the same batch dedupes against an earlier one.
  const rows: Interview[] = [...interviews];

  let classified = 0,
    created = 0,
    updated = 0,
    skipped = 0;

  for (const c of batch) {
    const msg = await getMessage(c.id);
    const reply = await callClaude({
      system: SYSTEM,
      user: `From: ${msg.from}\nSubject: ${msg.subject}\nDate: ${msg.date}\n\n${msg.body}`,
      maxTokens: 320,
    });
    classified++;
    const ex = parseJsonObject<Extract>(reply);
    if (!ex || !ex.is_interview || !ex.company) {
      skipped++;
      continue;
    }
    const norm = normalizeCompany(ex.company);
    if (!isH1bSponsor(ex.company) && !pipeline.has(norm)) {
      skipped++;
      continue;
    }

    const role = resolveRole(ex.company, ex.role, apps);
    const stage = mapStage(`${msg.subject} ${ex.stage_hint || ""}`) || "Interview";
    const status = ex.status || "Scheduled";
    const scheduledAt = ex.scheduled_at || "";
    const interviewer = ex.interviewer || "";
    const meta = buildMeta(ex, msg.date);

    const existing = findExisting(rows, ex.company, role, interviewer, scheduledAt);

    if (existing) {
      const nextStatus = shouldAdvance(existing.status, status) ? status : existing.status ?? status;
      const betterRole = pickRole(existing.role, role);
      const notes = appendNote(existing.notes, meta);
      const fields: Record<string, unknown> = {
        [FIELDS.interviews.status]: nextStatus,
        [FIELDS.interviews.lastUpdated]: today,
      };
      if (betterRole && betterRole !== existing.role) fields[FIELDS.interviews.role] = betterRole;
      // Upgrade a generic/blank stage to a specific one once we detect it.
      const setStage = stage !== "Interview" && (!existing.stage || existing.stage === "Interview");
      if (setStage) fields[FIELDS.interviews.stage] = stage;
      if (interviewer && !existing.interviewer) fields[FIELDS.interviews.interviewer] = interviewer;
      if (ex.interviewer_title && !existing.interviewerTitle) fields[FIELDS.interviews.interviewerTitle] = ex.interviewer_title;
      if (ex.call_link) fields[FIELDS.interviews.callLink] = ex.call_link;
      if (scheduledAt) fields[FIELDS.interviews.scheduledAt] = scheduledAt;
      if (notes !== (existing.notes ?? "")) fields[FIELDS.interviews.notes] = notes;

      if (!dryRun) await updateRecords(TABLES.interviews, primaryBase(), [{ id: existing.id, fields }]);
      // Reflect in the working set for subsequent emails this run.
      existing.status = nextStatus;
      if (betterRole) existing.role = betterRole;
      if (setStage) existing.stage = stage;
      if (interviewer && !existing.interviewer) existing.interviewer = interviewer;
      if (scheduledAt) existing.scheduledAt = scheduledAt;
      existing.notes = notes;
      updated++;
    } else {
      // Don't fabricate an interview row from a screening decision with no
      // interview evidence (e.g. a rejection for a role that never reached an
      // interview). syncApplications already records that on the Application.
      if (!isRealInterviewEvidence(status, scheduledAt, interviewer, stage)) {
        skipped++;
        continue;
      }
      const fields: Record<string, unknown> = {
        [FIELDS.interviews.label]: `${ex.company} — ${stage}`,
        [FIELDS.interviews.company]: ex.company,
        [FIELDS.interviews.stage]: stage,
        [FIELDS.interviews.status]: status,
        [FIELDS.interviews.lastUpdated]: today,
      };
      if (role) fields[FIELDS.interviews.role] = role;
      if (interviewer) fields[FIELDS.interviews.interviewer] = interviewer;
      if (ex.interviewer_title) fields[FIELDS.interviews.interviewerTitle] = ex.interviewer_title;
      if (ex.call_link) fields[FIELDS.interviews.callLink] = ex.call_link;
      if (scheduledAt) fields[FIELDS.interviews.scheduledAt] = scheduledAt;
      if (meta) fields[FIELDS.interviews.notes] = meta;

      let id = `dry-${created}`;
      if (!dryRun) {
        // Owner-stamped create (PRD §5.6 / G7).
        const [rec] = await createRecords(TABLES.interviews, primaryBase(), [
          withOwner("interviews", fields, ownerEmail),
        ]);
        id = rec.id;
      }
      rows.push({ id, company: ex.company, role, interviewer, stage, status, scheduledAt, notes: meta } as Interview);
      created++;
    }
  }

  const nextOffset = offset + batch.length;
  const remaining = Math.max(0, candidates.length - nextOffset);
  return {
    counts: { candidates: candidates.length, classified, created, updated, skipped, remaining, nextOffset },
    partial: remaining > 0,
    cursor: { offset: nextOffset },
    notes:
      `${dryRun ? "[DRY RUN] " : ""}processed ${batch.length} (${nextOffset}/${candidates.length}) — created ${created}, updated ${updated}, skipped ${skipped}` +
      (remaining > 0 ? ` — ${remaining} remaining` : ""),
  };
}
