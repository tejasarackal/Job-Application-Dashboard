// B1 — Lead research → Leads (Status=research). Port of _instructions_research.md.
// Targets are drawn from the vendored H1B sponsor registry; Apollo supplies the
// contact (people search) and company facts (org enrich). Writes one lead per
// sponsor with Status="research" for the human gate at /review.
//
// NOTE: the SOP also uses NinjaPear for funding/stack signal. NinjaPear has no
// server REST contract wired here yet, so company facts come from Apollo's org
// enrichment instead (honest, sourced) — NinjaPear enrichment is a future add.
import { COMPANY_REGISTRY, deriveBrand } from "@/lib/company-registry";
import { listLeads, createRecords, withOwner, TABLES, FIELDS, leadsBase } from "@/lib/airtable";
import { getUserPrefs } from "@/lib/prefs";
import { scoringPrefsFor } from "@/lib/scoring";
import { isOwner } from "@/lib/auth-shared";
import type { ScoringPrefs } from "./filters";
import type { RunResult } from "./runLog";

const APOLLO = "https://api.apollo.io/api/v1";
// Owner's curated DE hiring-manager titles (byte-for-byte legacy).
const OWNER_TITLES = [
  "Data Engineering Manager",
  "Director of Data Engineering",
  "Head of Data",
  "Engineering Manager, Data",
  "VP Engineering",
  "Director of Data",
];

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// Apollo `person_titles` for the actor (multi-user Phase 4). Owner → curated DE
// list; a member → contact/leadership variants derived from their OWN role
// keywords (deterministic, no extra API call) so research finds the right
// hiring managers for a TPM, PM, etc. — not data-engineering leaders.
export function contactTitlesFor(prefs: ScoringPrefs): string[] {
  if (prefs.ownerTitleTiers) return OWNER_TITLES;
  const out = new Set<string>();
  for (const kw of prefs.titleKeywords) {
    const k = titleCase(kw.trim());
    if (!k) continue;
    out.add(k);
    out.add(`Senior ${k}`);
    out.add(`${k} Manager`);
    out.add(`Director of ${k}`);
    out.add(`Head of ${k}`);
  }
  return [...out].slice(0, 10); // keep the Apollo query bounded
}

// Derive a company domain from its careers URL; fall back to a brand-based guess
// when the careers URL is an ATS host (Workday/Greenhouse) that hides the domain.
function deriveDomain(careersUrl: string, brand: string): string {
  const guess = `${brand.replace(/[^a-z0-9]/gi, "").toLowerCase()}.com`;
  try {
    const h = new URL(careersUrl).hostname.toLowerCase();
    if (/myworkdayjobs\.com|greenhouse\.io|lever\.co|workday\.com|icims\.com/.test(h)) return guess;
    return h.replace(/^(www|careers|jobs|job-boards|boards|apply|external|join|corporate|work)\./, "");
  } catch {
    return guess;
  }
}

interface ApolloPerson {
  first_name?: string;
  last_name?: string;
  name?: string;
  title?: string;
  linkedin_url?: string;
  email?: string;
  organization?: { estimated_num_employees?: number; industry?: string; name?: string };
}

function lockedEmail(email?: string): boolean {
  return !email || /not_unlocked|email_not_found|domain\.com$/i.test(email);
}

async function apollo(path: string, body: Record<string, unknown>): Promise<unknown> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) throw new Error("APOLLO_API_KEY not set");
  const res = await fetch(`${APOLLO}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", "x-api-key": key },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Apollo ${path} ${res.status} ${(await res.text()).slice(0, 140)}`);
  return res.json();
}

function stageFromHeadcount(n?: number): string | undefined {
  if (!n) return undefined;
  if (n < 200) return "early";
  if (n < 1000) return "growth";
  if (n < 5000) return "late";
  return "enterprise";
}

export async function researchLeads(
  opts: { ownerEmail: string; maxItems?: number; dryRun?: boolean; cursor?: { offset?: number } },
): Promise<RunResult> {
  const ownerEmail = opts.ownerEmail; // engine identity (PRD §5.6)
  if (!process.env.APOLLO_API_KEY) {
    return { counts: {}, partial: false, notes: "APOLLO_API_KEY not set — research disabled" };
  }
  const max = opts.maxItems ?? 1; // Apollo calls are the slow part; one per invocation
  // Cursor threads running totals so the final message covers the WHOLE run.
  const prior = (opts.cursor ?? {}) as {
    offset?: number;
    tFound?: number;
    tCreated?: number;
    tSkipped?: number;
    tErrors?: number;
  };
  const offset = prior.offset ?? 0;
  const dryRun = Boolean(opts.dryRun);

  // Actor's prefs → who to search for (contact titles) + the lead signal text.
  const prefs = scoringPrefsFor(ownerEmail, await getUserPrefs(ownerEmail));
  const personTitles = contactTitlesFor(prefs);
  // Owner keeps the legacy "Bay Area / Remote" signal byte-for-byte; a member
  // uses their first location; neutral → no location phrase.
  const signalLocation = prefs.ownerTitleTiers
    ? "Bay Area / Remote"
    : prefs.locations[0]?.trim()
      ? titleCase(prefs.locations[0].trim())
      : "";

  // Self-employer exclusion is OWNER-ONLY (Meta — see knowledge/about); members
  // don't auto-exclude an employer (owner decision, Phase 4).
  const SELF_EMPLOYERS = /^meta\b|metacareers/i;
  const excludeSelf = isOwner(ownerEmail);
  const targets = Object.entries(COMPANY_REGISTRY)
    .filter(([name, meta]) => !excludeSelf || (!SELF_EMPLOYERS.test(name) && !SELF_EMPLOYERS.test(meta.careersUrl)))
    .map(([name, meta]) => ({
      name,
      brand: meta.brand ?? deriveBrand(name),
      domain: deriveDomain(meta.careersUrl, meta.brand ?? deriveBrand(name)),
    }));
  const batch = targets.slice(offset, offset + max);

  // Dedup set: existing lead emails + linkedin URLs (owner-scoped read).
  const existing = await listLeads(ownerEmail);
  const seenEmail = new Set(existing.map((l) => (l.email ?? "").toLowerCase()).filter(Boolean));
  const seenLi = new Set(existing.map((l) => (l.linkedin ?? "").toLowerCase()).filter(Boolean));
  const seenCompany = new Set(existing.map((l) => l.company.toLowerCase()));

  let found = 0,
    created = 0,
    skipped = 0,
    errors = 0;
  let firstError = "";

  for (const t of batch) {
    try {
      if (seenCompany.has(t.name.toLowerCase()) || seenCompany.has(t.brand.toLowerCase())) {
        skipped++;
        continue;
      }
      const search = (await apollo("/mixed_people/api_search", {
        person_titles: personTitles,
        q_organization_domains: t.domain,
        page: 1,
        per_page: 2,
      })) as { people?: ApolloPerson[] };

      const person = (search.people ?? []).find((p) => p.first_name || p.name);
      if (!person) {
        skipped++;
        continue;
      }
      found++;

      const li = (person.linkedin_url ?? "").toLowerCase();
      let email = person.email;
      if (li && seenLi.has(li)) {
        skipped++;
        continue;
      }

      // Reveal a locked email via People Match (costs credits) — only on real runs.
      if (lockedEmail(email) && !dryRun) {
        try {
          const m = (await apollo("/people/match", {
            first_name: person.first_name,
            last_name: person.last_name,
            organization_name: t.brand,
            domain: t.domain,
          })) as { person?: { email?: string } };
          email = m.person?.email;
        } catch {
          /* enrichment is best-effort */
        }
      }
      if (email && seenEmail.has(email.toLowerCase())) {
        skipped++;
        continue;
      }

      const channel = email && !lockedEmail(email) ? "email" : "linkedin";
      const org = person.organization;
      // Signal reflects the ACTOR's location pref (owner → Bay Area; neutral → none).
      const recentSignal =
        `H1B sponsor${signalLocation ? ` (${signalLocation})` : ""}. ${org?.industry ?? "tech"}` +
        (org?.estimated_num_employees ? `, ~${org.estimated_num_employees.toLocaleString()} employees.` : ".");

      if (!dryRun) {
        // Owner-stamped create (PRD §5.6 / G7).
        await createRecords(TABLES.leads, leadsBase(), [
          withOwner("leads", {
            [FIELDS.leads.firstName]: person.first_name ?? person.name?.split(" ")[0] ?? "",
            [FIELDS.leads.lastName]: person.last_name ?? person.name?.split(" ").slice(1).join(" ") ?? "",
            [FIELDS.leads.title]: person.title ?? "",
            [FIELDS.leads.company]: t.brand,
            [FIELDS.leads.website]: `https://${t.domain}`,
            ...(email && !lockedEmail(email) ? { [FIELDS.leads.email]: email } : {}),
            ...(person.linkedin_url ? { [FIELDS.leads.linkedin]: person.linkedin_url } : {}),
            [FIELDS.leads.channel]: channel,
            [FIELDS.leads.status]: "research",
            [FIELDS.leads.recentSignal]: recentSignal,
            ...(org?.industry ? { [FIELDS.leads.industry]: org.industry } : {}),
            ...(stageFromHeadcount(org?.estimated_num_employees)
              ? { [FIELDS.leads.companyStage]: stageFromHeadcount(org?.estimated_num_employees) }
              : {}),
          }, ownerEmail),
        ]);
        // keep this run idempotent against itself
        if (email) seenEmail.add(email.toLowerCase());
        if (li) seenLi.add(li);
        seenCompany.add(t.brand.toLowerCase());
      }
      created++;
    } catch (e) {
      errors++;
      if (!firstError) firstError = (e as Error).message;
    }
  }

  const tFound = (prior.tFound ?? 0) + found;
  const tCreated = (prior.tCreated ?? 0) + created;
  const tSkipped = (prior.tSkipped ?? 0) + skipped;
  const tErrors = (prior.tErrors ?? 0) + errors;
  const nextOffset = offset + batch.length;
  const remaining = Math.max(0, targets.length - nextOffset);
  return {
    counts: { found: tFound, created: tCreated, skipped: tSkipped, errors: tErrors, remaining, nextOffset },
    partial: remaining > 0 && nextOffset < targets.length,
    cursor: { offset: nextOffset, tFound, tCreated, tSkipped, tErrors },
    notes:
      `${dryRun ? "[DRY RUN] " : ""}researched ${nextOffset} sponsors → found ${tFound}, created ${tCreated}, skipped ${tSkipped}` +
      (tErrors ? `, ${tErrors} errors${firstError ? ` (${firstError})` : ""}` : "") +
      (remaining > 0 ? ` — ${remaining} sponsors remaining` : ""),
  };
}
