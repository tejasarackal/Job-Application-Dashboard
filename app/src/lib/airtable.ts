// Airtable client. Talks to the REST API directly with the user's Personal
// Access Token. We translate field IDs → friendly names here so callers
// only deal with typed objects.
//
// Why field IDs instead of names: Airtable lets users rename columns at any
// time; field IDs are stable.

import type {
  JobListing,
  OutreachContact,
  Application,
  Interview,
  ScrapeTarget,
  TargetCompany,
  PipelineSummary,
  WorkflowRun,
  WorkflowName,
  WorkflowTrigger,
} from "./types";
import { lookupCompany } from "./company-registry";
import { normalizeEmail } from "./auth-shared";

const API = "https://api.airtable.com/v0";

// Table + field IDs come from the live schema of base `app8aBP9UPmxYaEgI`.
// If the user adds/removes columns these may need to be regenerated.
export const TABLES = {
  outreach: "tblr7L5KixQqQxrxG",
  h1bCompanies: "tblGVG4F5cTrAoaoh",
  jobListings: "tbl4VpyV2wysMPrxL",
  applications: "tblRFVT8JwGccOHsv",
  interviews: "tblq3kP2aT6mOTn6N",
  // Deduped scraper-read mart, derived from h1bCompanies by refresh_scrape_targets.
  scrapeTargets: "tbl6bziCc2zjV10D4",
  // Run log for dashboard-triggered workflows (see PRD-workflow-engine.md).
  workflowRuns: "tblg1lBADrP2wfdGY",
  // Second base: Automation Dev Outreach (appkusCXgR7KcEmLO).
  // Used as a secondary outreach tracker (sourced/automated leads).
  leads: "tblI5KPof3PmTjDmY",
  // Multi-user tables (PRD-multi-user §6, created in M1 — IDs in
  // IMPLEMENTATION-multi-user.md "Key IDs & constants").
  users: "tblj8NSWLfAfRY4uP",
  userTargets: "tbl6SchfGe6Ifw4Zy",
  adminAudit: "tbluzpqt0ehm9y7bK",
};

/** Users table id, overridable via the (already-staged) env var. */
export function usersTable(): string {
  return process.env.AIRTABLE_USERS_TABLE || TABLES.users;
}

// Default base IDs — overridable via env vars in case the user clones the
// bases. Same token works for both since they're in the same workspace.
const DEFAULT_PRIMARY_BASE = "app8aBP9UPmxYaEgI";
const DEFAULT_LEADS_BASE = "appkusCXgR7KcEmLO";

export function primaryBase(): string {
  return process.env.AIRTABLE_BASE_ID || DEFAULT_PRIMARY_BASE;
}
export function leadsBase(): string {
  return process.env.AIRTABLE_LEADS_BASE_ID || DEFAULT_LEADS_BASE;
}

export const FIELDS = {
  jobListings: {
    title: "fldvG8tfxw9X9k0Ib",
    company: "fldpxGMiXpNR3PIRE",
    url: "fldgiMLgKbT9gNgNL",
    board: "fldXO6iWCq15HYWys",
    location: "fld9R9Z6QzUgRccYr",
    remote: "fldhguScKKp4DOrjF",
    status: "fldPKHldpqSKDEn7b",
    skipReason: "fldlMadXXAOsh28nh",
    salary: "fldgZFska9MJcnjTf",
    scrapedAt: "fldYq2oG1eQRLuFPm",
    h1bVerified: "fldcWxBMhtdj2QCEQ",
    postedAt: "fldAUEjwZF38JOTEI",
    matchPct: "fldjxMa1Ry45H2vgm",
    userEmail: "fldeKB0L7KlyEZ3bA",
  },
  scrapeTargets: {
    company: "fldVWXI1xMOP5oQRT",
    normalizedName: "flddWVp7lbY699TjW",
    ats: "fldXnoS3j7bXl7QaT",
    boardToken: "fld14LShpj9huxG2Y",
    careersUrl: "fld1Jc39oV0Eyln6M",
    linkedinId: "fld1UeL2ET3ocnNaG",
    bayArea: "fldeXUUenhmcIA5vR",
    remoteOk: "fldtw9PoaYpH9jVpt",
    coverageStatus: "fldLWZR629LskkG5G",
    lastScraped: "fldUDPyuywAKOjStP",
    lastJobCount: "fldVEBut14cbW6BTu",
  },
  outreach: {
    company: "fldtL0SzPjKj7LS3b",
    contactName: "fldujUwoDuvZnGecl",
    title: "flddMvZhnEfaiQsq9",
    email: "fldCkQFfEkgpO3W8P",
    linkedin: "fldOwdhNh09jOGAMR",
    channel: "fldlssZwc2xo2nziq",
    status: "fldOVoruvkLAkWOv8",
    date: "fldTk6auQPKstQDpX",
    followUpNeeded: "fldJVXGbleLiD6PQY",
    lastCommunication: "fldQUnlrQGhHDO6A1",
    interviewStage: "fldLO8aZe2lhQguw2",
    threadId: "fldx48ACJTAYWF1mC",
    userEmail: "fldXZMLWyrhRcHBg7",
  },
  applications: {
    applicationId: "fldgK9aUJTpceHmzo",
    company: "fldXgdeiul41hYOzh",
    jobTitle: "fldiTpDrZeuDNVypX",
    jobUrl: "fldQ3WB2NJd7VfHhz",
    status: "fldOrlAIVvUWcDUgJ",
    submittedAt: "fldVrfhsG9SjMvUxL",
    interviewStage: "fldPVduW3T4guKTKL",
    board: "fld91p2wi5KB04mS7",
    followUpDate: "fldnOlba6BczFffQh",
    followUpDone: "fldDYCiJQn5HcJTik",
    userEmail: "fldKi8vQKjTS00OkG",
  },
  interviews: {
    label: "fld5AM8iDJ1LKF0jY",
    company: "flddyBA0Vwr6fTQVn",
    role: "fld5KGXzS3Qr1wqUX",
    interviewer: "fldZQikXDhkrXtAaG",
    interviewerTitle: "fldyKwlWaI3Ck5T1O",
    callLink: "fldwkNmobTuoYWm0F",
    stage: "fldSD3fPYTSSlPB42",
    status: "fldEvmcuvZjgunHXZ",
    scheduledAt: "fldMSgyMx65xanmbI",
    nextFollowUp: "fld8T8HcqmL2UTxcn",
    lastUpdated: "fldC48XdyMbhMjByp",
    jobPostingUrl: "flduC8s3Ink1zJ9bP",
    notes: "fldRlSIOj743LXvH4",
    userEmail: "flddzqw6PUKWMsP1T",
  },
  h1bCompanies: {
    employer: "fldTjkVdbOR0VJgKA",
    sector: "fld1uJLZXZ7f0DWqn",
    city: "fldF9B5T5PlMxIHO6",
    lcaCount: "fldQPe5sMqZ9VdV2Z",
    status: "fldBQykB3t3WmaPwi",
    bayArea: "fldMG3qNiLt1VTE89",
    remoteFriendly: "fldFET1ORd3Bq1OSA",
    ats: "fldJRsNWtV9bw5Ngy",
    careersUrl: "fldhFdAzRAgpLaGai",
    linkedinId: "fldrsDe7bada7aNAw",
  },
  workflowRuns: {
    run: "fld5XNYX8teMRB4s7",
    workflow: "fldyLuR7AUSgSvLxk",
    trigger: "fldbylVcg5NtgO8Zb",
    status: "fldVVJhyWGUnaSJl6",
    startedAt: "fldGUh23DE66t3iDI",
    finishedAt: "fldEq3KyUNSjd0OWO",
    counts: "fldaFhY5ELtrvr7aC",
    notes: "fldb65eJR5x30c5W6",
    userEmail: "fldFtoIA9qvmx2VgJ",
  },
  leads: {
    firstName: "fldL8cWbBDzwCHdqd",
    lastName: "fldk7kFAX3S3N0g8x",
    title: "fldbahxaMty1irP9v",
    company: "fldJpna1aWZckRlBN",
    website: "fldQgZfxNJsbglyuN",
    email: "fldnKMiwgRXN3nbov",
    linkedin: "fld0eCTEpplRCQwUd",
    hiringSignal: "fld76WIrOJwecc4ET",
    roleLevel: "fldhjq6xvOnZiFOjE",
    channel: "fld4Adn68bgy9iwh4",
    companyStage: "fldWEE8hH8LcYzc6y",
    status: "fldVfXgCpLF4jk3Ik",
    outreachDate: "fld5S4Hrfrfgefs28",
    followUpDate: "fldgFxwGfqVvMlxnJ",
    recentSignal: "fldx1FU0RcZUEPtDC",
    companyInfo: "fldlK2Awkk30q2d1e",
    dataStack: "fldUbpmFLdYc4YnZR",
    jobPostingUrl: "fldS9DnORnkfH51av",
    country: "fldt7XqoxALrdCkv4",
    industry: "fldk8VUmDK4VDVCWD",
    emailSubject: "fldkrnqZpvaQDaFkR",
    emailBody: "fldIJnW51eO6GvPHw",
    userEmail: "fldsyrzFmBkZIW5sZ",
  },
  users: {
    email: "fld9asG1fbAyneSq2",
    name: "fldibJorYEjCjBnPj",
    authSub: "fldMr3QyKiuYlnCSu",
    accountStatus: "fldenOeaTeA4DnQf4",
    onboardingStatus: "fldvALhGN3NdBZEj9",
    defaultTargets: "fldnelGtFjsniXSIS",
    preferences: "fldh0X3lcG0fraV0w",
    lastLogin: "flddvShgUem4rqEwH",
  },
  userTargets: {
    userEmail: "fldglKur3FlymvhBe",
    companyKey: "fldkWhCXnR1o9JqkC",
    status: "fldkln3E5Qx9euozZ",
    companyName: "fldbxjMljBL6dAvuo",
    careersUrl: "fldRFNHh6xCkiW28n",
    h1bVerified: "fldwV7zPDidWEizJo",
  },
  adminAudit: {
    actorEmail: "fldEjr2nP5kqSl7V7",
    action: "fldhmBYZPTdeOCh4f",
    targetEmail: "fldpxFdIBhpyW8pTI",
    at: "flddQSIV33AKeNavl",
    note: "fldZA61SPHM3k6SC2",
  },
};

// ── Tenancy & formula safety (PRD-multi-user §5.4, D5/D6) ────────────────────

// The ONLY field names ever referenced inside a filterByFormula. These columns
// are FROZEN in Airtable — never rename them. A rename fails closed (formula
// matches nothing → empty reads), and the gated health detail probes them so a
// rename surfaces as a named failure, not a silent outage.
export const FIELD_NAMES = { ownerField: "User Email", usersEmail: "Email" } as const;

// Owned tables: every read MUST be tenant-filtered (runtime guard below) and
// every list* requires a positional userEmail. h1bCompanies/scrapeTargets/users/
// userTargets/adminAudit are unowned or keyed reads (PRD §5.4).
export type OwnedTableKey =
  | "jobListings"
  | "applications"
  | "interviews"
  | "outreach"
  | "workflowRuns"
  | "leads";

const OWNED_TABLES = new Set<string>([
  TABLES.jobListings,
  TABLES.applications,
  TABLES.interviews,
  TABLES.outreach,
  TABLES.workflowRuns,
  TABLES.leads,
]);

/** Base id an owned table lives in (leads is in the secondary base). */
export function ownedBase(tableKey: OwnedTableKey): string {
  return tableKey === "leads" ? leadsBase() : primaryBase();
}

// filterByFormula is this architecture's injection surface (PRD D6).
// Backslash FIRST, then quotes; empty string throws because `{User Email}=''`
// matches every blank-owner row (CR-S5). Moved here from lib/users.ts (M2) —
// users.ts re-imports it.
export function escapeFormulaString(v: string): string {
  if (v === "" || /[\r\n\0]/.test(v)) throw new Error("invalid formula value");
  return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// RFC-lite shape check before any email is interpolated into a formula.
const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/** Owner predicate for filterByFormula: LOWER({User Email}) = '<escaped email>'. */
export function ownerFilter(email: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("ownerFilter: empty email");
  if (!EMAIL_RE.test(normalized)) throw new Error("ownerFilter: invalid email shape");
  return `LOWER({${FIELD_NAMES.ownerField}}) = '${escapeFormulaString(normalized)}'`;
}

// Record ids are client-supplied in the mutation paths (CR-S3) — shape-validate
// before interpolating into a formula.
const RECORD_ID_RE = /^rec[A-Za-z0-9]{14,17}$/;

export function recordIdFilter(ids: string[]): string {
  if (!ids.length) throw new Error("recordIdFilter: no record ids");
  for (const id of ids) {
    if (!RECORD_ID_RE.test(id)) throw new Error("recordIdFilter: invalid record id");
  }
  return `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
}

// Defense-in-depth second check (PRD D5): after the server-side formula filter,
// re-verify each returned row's owner by FIELD ID in code. A mismatch is a
// security anomaly — alarm and drop the row, never render it.
function postFilterOwned(
  records: AirtableRecord[],
  ownerFieldId: string,
  userEmail: string,
  tableLabel: string,
): AirtableRecord[] {
  const expected = normalizeEmail(userEmail);
  return records.filter((r) => {
    const actual = normalizeEmail(String(r.fields[ownerFieldId] ?? ""));
    if (actual !== expected) {
      console.error(
        `SECURITY: owner post-filter mismatch — table=${tableLabel} record=${r.id}; row dropped`,
      );
      return false;
    }
    return true;
  });
}

interface AirtableRecord {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
}

interface AirtableListResponse {
  records: AirtableRecord[];
  offset?: string;
}

export function isConfigured(): boolean {
  // Base IDs default to known values, so only the token is required.
  return Boolean(process.env.AIRTABLE_TOKEN);
}

async function fetchAllRecords(
  table: string,
  baseId?: string,
  opts?: { fresh?: boolean; filterByFormula?: string },
): Promise<AirtableRecord[]> {
  const token = process.env.AIRTABLE_TOKEN;
  const base = baseId ?? primaryBase();
  if (!token) throw new Error("Airtable not configured");

  // Runtime tenancy guard (PRD D5): a "forgot the filter" read of an owned table
  // must be a crash, not a leak. Server-side filtering is mandatory — this
  // function caps at 10 pages, so read-then-post-filter silently truncates and
  // can never be the primary isolation mechanism (PRD §6.3).
  if (OWNED_TABLES.has(table) && !opts?.filterByFormula) {
    throw new Error(`owned table read without owner filter: ${table}`);
  }

  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  // Cap to a few pages to keep response time reasonable.
  for (let i = 0; i < 10; i++) {
    const url = new URL(`${API}/${base}/${table}`);
    url.searchParams.set("pageSize", "100");
    // Return field IDs as keys (not names) — all our FIELDS maps use stable IDs.
    url.searchParams.set("returnFieldsByFieldId", "true");
    // The formula rides in the fetch URL, so Next's 30s data cache is keyed
    // per-user automatically (PRD §4) — caching semantics are unchanged.
    if (opts?.filterByFormula) url.searchParams.set("filterByFormula", opts.filterByFormula);
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      // Interactive surfaces (review gates) pass fresh:true to bypass the cache so
      // an action shows immediately; everything else caches 30s to spare Airtable.
      ...(opts?.fresh ? { cache: "no-store" as const } : { next: { revalidate: 30 } }),
    });
    if (!res.ok) throw new Error(`Airtable ${res.status} ${await res.text()}`);
    const json = (await res.json()) as AirtableListResponse;
    records.push(...json.records);
    offset = json.offset;
    if (!offset) break;
  }
  return records;
}

// Airtable select cells come back as `{id, name, color}`. We want just the name.
function selectName(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "name" in v) return (v as { name: string }).name;
  return undefined;
}

export async function listJobListings(
  userEmail: string,
  opts?: { fresh?: boolean },
): Promise<JobListing[]> {
  const records = postFilterOwned(
    await fetchAllRecords(TABLES.jobListings, primaryBase(), {
      ...opts,
      filterByFormula: ownerFilter(userEmail),
    }),
    FIELDS.jobListings.userEmail,
    userEmail,
    "jobListings",
  );
  const f = FIELDS.jobListings;
  const rawPct = (v: unknown) =>
    typeof v === "number" ? Math.round(v * 100) : undefined; // Airtable percent → 0-100
  const listings: JobListing[] = records.map((r) => ({
    id: r.id,
    title: (r.fields[f.title] as string) ?? "Untitled",
    company: (r.fields[f.company] as string) ?? "—",
    url: r.fields[f.url] as string | undefined,
    board: selectName(r.fields[f.board]),
    location: r.fields[f.location] as string | undefined,
    remote: Boolean(r.fields[f.remote]),
    status: selectName(r.fields[f.status]),
    skipReason: selectName(r.fields[f.skipReason]),
    salary: r.fields[f.salary] as string | undefined,
    scrapedAt: r.fields[f.scrapedAt] as string | undefined,
    h1bVerified: Boolean(r.fields[f.h1bVerified]),
    postedAt: r.fields[f.postedAt] as string | undefined,
    matchPct: rawPct(r.fields[f.matchPct]),
  }));
  // Default order: most recently scraped first, then most recently posted, then
  // best match. Mirrors ListingsTable#freshness so SSR and the interactive table
  // agree (dates are day-granular "YYYY-MM-DD", so same-day rows tiebreak on match).
  listings.sort(
    (a, b) =>
      (b.scrapedAt ?? "").localeCompare(a.scrapedAt ?? "") ||
      (b.postedAt ?? "").localeCompare(a.postedAt ?? "") ||
      (b.matchPct ?? -1) - (a.matchPct ?? -1),
  );
  return listings;
}

// Deduped scraper-read mart (one row per real company, verified ats + board_token).
// scrape_jobs iterates this; refresh_scrape_targets populates it from h1bCompanies.
export async function listScrapeTargets(opts?: { fresh?: boolean }): Promise<ScrapeTarget[]> {
  const records = await fetchAllRecords(TABLES.scrapeTargets, primaryBase(), opts);
  const f = FIELDS.scrapeTargets;
  return records.map((r) => ({
    id: r.id,
    company: (r.fields[f.company] as string) ?? "",
    normalizedName: r.fields[f.normalizedName] as string | undefined,
    ats: selectName(r.fields[f.ats]),
    boardToken: r.fields[f.boardToken] as string | undefined,
    careersUrl: r.fields[f.careersUrl] as string | undefined,
    linkedinId: r.fields[f.linkedinId] as string | undefined,
    bayArea: Boolean(r.fields[f.bayArea]),
    remoteOk: Boolean(r.fields[f.remoteOk]),
    coverageStatus: selectName(r.fields[f.coverageStatus]),
    lastScraped: r.fields[f.lastScraped] as string | undefined,
    lastJobCount: r.fields[f.lastJobCount] as number | undefined,
  }));
}

export async function listOutreach(userEmail: string): Promise<OutreachContact[]> {
  const records = postFilterOwned(
    await fetchAllRecords(TABLES.outreach, primaryBase(), {
      filterByFormula: ownerFilter(userEmail),
    }),
    FIELDS.outreach.userEmail,
    userEmail,
    "outreach",
  );
  return records.map((r) => ({
    id: r.id,
    source: "outreach" as const,
    company: (r.fields[FIELDS.outreach.company] as string) ?? "—",
    contactName: r.fields[FIELDS.outreach.contactName] as string | undefined,
    title: r.fields[FIELDS.outreach.title] as string | undefined,
    email: r.fields[FIELDS.outreach.email] as string | undefined,
    linkedin: r.fields[FIELDS.outreach.linkedin] as string | undefined,
    channel: selectName(r.fields[FIELDS.outreach.channel]),
    status: selectName(r.fields[FIELDS.outreach.status]),
    date: r.fields[FIELDS.outreach.date] as string | undefined,
    followUpNeeded: Boolean(r.fields[FIELDS.outreach.followUpNeeded]),
    lastCommunication: r.fields[FIELDS.outreach.lastCommunication] as string | undefined,
    interviewStage: selectName(r.fields[FIELDS.outreach.interviewStage]),
    threadId: r.fields[FIELDS.outreach.threadId] as string | undefined,
  }));
}

// Some lead text fields were written JSON-encoded upstream (researchLeads.ts),
// so the value arrives wrapped in quotes with `\"` escapes that otherwise leak
// into the rendered card. Decode once here so every consumer gets clean text.
// (Fix the writer too — see researchLeads.ts#recentSignal — but this keeps the
// dashboard honest regardless of what's already stored.)
function cleanSignal(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  let s = v.trim();
  if (!s) return undefined;
  if (s.startsWith('"') && s.endsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (typeof parsed === "string") s = parsed;
    } catch {
      s = s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
  }
  return s.trim() || undefined;
}

// Leads = the second outreach tracker (Automation Dev Outreach base).
// We normalize Leads rows into the same OutreachContact shape so the UI
// can treat both the same way, with a `source` discriminator.
export async function listLeads(
  userEmail: string,
  opts?: { fresh?: boolean },
): Promise<OutreachContact[]> {
  const records = postFilterOwned(
    await fetchAllRecords(TABLES.leads, leadsBase(), {
      ...opts,
      filterByFormula: ownerFilter(userEmail),
    }),
    FIELDS.leads.userEmail,
    userEmail,
    "leads",
  );
  return records.map((r) => {
    const fn = r.fields[FIELDS.leads.firstName] as string | undefined;
    const ln = r.fields[FIELDS.leads.lastName] as string | undefined;
    return {
      id: r.id,
      source: "leads" as const,
      company: (r.fields[FIELDS.leads.company] as string) ?? "—",
      contactName: [fn, ln].filter(Boolean).join(" ") || undefined,
      title: r.fields[FIELDS.leads.title] as string | undefined,
      email: r.fields[FIELDS.leads.email] as string | undefined,
      linkedin: r.fields[FIELDS.leads.linkedin] as string | undefined,
      channel: selectName(r.fields[FIELDS.leads.channel]),
      status: selectName(r.fields[FIELDS.leads.status]),
      date: r.fields[FIELDS.leads.outreachDate] as string | undefined,
      hiringSignal: selectName(r.fields[FIELDS.leads.hiringSignal]),
      roleLevel: selectName(r.fields[FIELDS.leads.roleLevel]),
      companyStage: selectName(r.fields[FIELDS.leads.companyStage]),
      recentSignal: cleanSignal(r.fields[FIELDS.leads.recentSignal]),
      emailSubject: r.fields[FIELDS.leads.emailSubject] as string | undefined,
      emailBody: r.fields[FIELDS.leads.emailBody] as string | undefined,
    };
  });
}

// LinkedIn numeric company IDs entered on H1B_Companies — feeds the scrape's
// `f_C=` source-filter so LinkedIn returns only sponsors. Empty until filled.
export async function listH1bLinkedinIds(): Promise<string[]> {
  const records = await fetchAllRecords(TABLES.h1bCompanies, primaryBase());
  const ids = records
    .map((r) => String(r.fields[FIELDS.h1bCompanies.linkedinId] ?? "").trim())
    .filter((s) => /^\d{3,}$/.test(s));
  return Array.from(new Set(ids));
}

// Convenience: both sources merged, sorted newest-first.
export async function listAllOutreach(userEmail: string): Promise<OutreachContact[]> {
  const [a, b] = await Promise.all([listOutreach(userEmail), listLeads(userEmail)]);
  return [...a, ...b].sort((x, y) => (y.date ?? "").localeCompare(x.date ?? ""));
}

export async function listApplications(userEmail: string): Promise<Application[]> {
  const records = postFilterOwned(
    await fetchAllRecords(TABLES.applications, primaryBase(), {
      filterByFormula: ownerFilter(userEmail),
    }),
    FIELDS.applications.userEmail,
    userEmail,
    "applications",
  );
  return records.map((r) => ({
    id: r.id,
    applicationId: (r.fields[FIELDS.applications.applicationId] as string) ?? r.id,
    company: (r.fields[FIELDS.applications.company] as string) ?? "—",
    jobTitle: (r.fields[FIELDS.applications.jobTitle] as string) ?? "—",
    jobUrl: r.fields[FIELDS.applications.jobUrl] as string | undefined,
    status: selectName(r.fields[FIELDS.applications.status]),
    submittedAt: r.fields[FIELDS.applications.submittedAt] as string | undefined,
    interviewStage: selectName(r.fields[FIELDS.applications.interviewStage]),
    board: selectName(r.fields[FIELDS.applications.board]),
    followUpDate: r.fields[FIELDS.applications.followUpDate] as string | undefined,
    followUpDone: Boolean(r.fields[FIELDS.applications.followUpDone]),
  }));
}

export async function listInterviews(userEmail: string): Promise<Interview[]> {
  const records = postFilterOwned(
    await fetchAllRecords(TABLES.interviews, primaryBase(), {
      filterByFormula: ownerFilter(userEmail),
    }),
    FIELDS.interviews.userEmail,
    userEmail,
    "interviews",
  );
  return records.map((r) => ({
    id: r.id,
    label: r.fields[FIELDS.interviews.label] as string | undefined,
    company: (r.fields[FIELDS.interviews.company] as string) ?? "—",
    role: r.fields[FIELDS.interviews.role] as string | undefined,
    interviewer: r.fields[FIELDS.interviews.interviewer] as string | undefined,
    interviewerTitle: r.fields[FIELDS.interviews.interviewerTitle] as string | undefined,
    callLink: r.fields[FIELDS.interviews.callLink] as string | undefined,
    stage: selectName(r.fields[FIELDS.interviews.stage]),
    status: selectName(r.fields[FIELDS.interviews.status]),
    scheduledAt: r.fields[FIELDS.interviews.scheduledAt] as string | undefined,
    nextFollowUp: r.fields[FIELDS.interviews.nextFollowUp] as string | undefined,
    lastUpdated: r.fields[FIELDS.interviews.lastUpdated] as string | undefined,
    jobPostingUrl: r.fields[FIELDS.interviews.jobPostingUrl] as string | undefined,
    notes: r.fields[FIELDS.interviews.notes] as string | undefined,
  }));
}

export async function listTargets(): Promise<TargetCompany[]> {
  const records = await fetchAllRecords(TABLES.h1bCompanies, primaryBase());
  return records.map((r) => {
    const employer = (r.fields[FIELDS.h1bCompanies.employer] as string) ?? "—";
    // Read from Airtable fields when populated; fall back to static registry.
    const airtableAts = FIELDS.h1bCompanies.ats
      ? selectName(r.fields[FIELDS.h1bCompanies.ats])
      : undefined;
    const airtableUrl = FIELDS.h1bCompanies.careersUrl
      ? (r.fields[FIELDS.h1bCompanies.careersUrl] as string | undefined)
      : undefined;
    const registry = lookupCompany(employer);
    return {
      id: r.id,
      employer,
      sector: r.fields[FIELDS.h1bCompanies.sector] as string | undefined,
      city: r.fields[FIELDS.h1bCompanies.city] as string | undefined,
      lcaCount: r.fields[FIELDS.h1bCompanies.lcaCount] as number | undefined,
      status: selectName(r.fields[FIELDS.h1bCompanies.status]),
      bayArea: Boolean(r.fields[FIELDS.h1bCompanies.bayArea]),
      remoteFriendly: Boolean(r.fields[FIELDS.h1bCompanies.remoteFriendly]),
      ats: airtableAts ?? registry?.ats,
      careersUrl: airtableUrl ?? registry?.careersUrl,
      linkedinId: String(r.fields[FIELDS.h1bCompanies.linkedinId] ?? "").trim() || undefined,
    };
  });
}

// ── Write layer ──────────────────────────────────────────────────────────────
// The dashboard was read-only; these are the first writers (PRD-workflow-engine.md).
// Airtable caps batch writes at 10 records/request, so we chunk. Field keys are
// the same stable field IDs the read maps use.

async function writeRecords(
  method: "POST" | "PATCH",
  table: string,
  baseId: string,
  records: Array<{ id?: string; fields: Record<string, unknown> }>,
): Promise<AirtableRecord[]> {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("Airtable not configured");

  const out: AirtableRecord[] = [];
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await fetch(`${API}/${baseId}/${table}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      // typecast lets us pass singleSelect option names as plain strings.
      body: JSON.stringify({ records: batch, typecast: true }),
    });
    if (!res.ok) throw new Error(`Airtable ${method} ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { records: AirtableRecord[] };
    out.push(...json.records);
  }
  return out;
}

export function createRecords(
  table: string,
  baseId: string,
  rows: Array<Record<string, unknown>>,
): Promise<AirtableRecord[]> {
  return writeRecords("POST", table, baseId, rows.map((fields) => ({ fields })));
}

export function updateRecords(
  table: string,
  baseId: string,
  rows: Array<{ id: string; fields: Record<string, unknown> }>,
): Promise<AirtableRecord[]> {
  return writeRecords("PATCH", table, baseId, rows);
}

/** Batched (≤10/req) hard delete. MVP use is ONLY the server-side targets diff —
 *  member pipeline rows are never hard-deleted (status-archive instead). */
export async function deleteRecords(table: string, baseId: string, ids: string[]): Promise<void> {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("Airtable not configured");
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10);
    const url = new URL(`${API}/${baseId}/${table}`);
    for (const id of batch) url.searchParams.append("records[]", id);
    const res = await fetch(url.toString(), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Airtable DELETE ${res.status} ${await res.text()}`);
  }
}

// ── Ownership enforcement (PRD §5.4) ─────────────────────────────────────────

/** Server-side owner stamp for every owned-table create. Client-supplied owner
 *  values are ignored — the stamp always wins (spread order). */
export function withOwner(
  tableKey: OwnedTableKey,
  fields: Record<string, unknown>,
  userEmail: string,
): Record<string, unknown> {
  const normalized = normalizeEmail(userEmail);
  if (!normalized) throw new Error("withOwner: empty owner email");
  return { ...fields, [FIELDS[tableKey].userEmail]: normalized };
}

/** Thrown by assertOwnership. 404 by design: a missing record and another
 *  user's record are indistinguishable to the caller (no existence oracle). */
export class OwnershipError extends Error {
  readonly status = 404;
  constructor(message = "not found") {
    super(message);
    this.name = "OwnershipError";
  }
}

/** Proof-before-mutation (PRD D5): fresh no-store read filtered
 *  AND(recordIdFilter, ownerFilter); throws OwnershipError unless EVERY id
 *  comes back owned. Always called with the SESSION email, never effectiveEmail. */
export async function assertOwnership(
  table: string,
  baseId: string,
  userEmail: string,
  recordIds: string[],
): Promise<void> {
  if (!recordIds.length) throw new OwnershipError();
  const formula = `AND(${recordIdFilter(recordIds)}, ${ownerFilter(userEmail)})`;
  const records = await fetchAllRecords(table, baseId, { fresh: true, filterByFormula: formula });
  const owned = new Set(records.map((r) => r.id));
  for (const id of recordIds) {
    if (!owned.has(id)) throw new OwnershipError();
  }
}

// ── Admin / migration surface (loud by design — PRD D5, G12) ─────────────────

export type AdminAuditAction =
  | "view_as_enter"
  | "view_as_exit"
  | "migrate_run"
  | "user_disable"
  | "user_enable";

/** Append-only Admin_Audit row (PRD §6.5). */
export async function logAdminAudit(
  action: AdminAuditAction,
  actorEmail: string,
  targetEmail: string,
  note?: string,
): Promise<void> {
  const f = FIELDS.adminAudit;
  await createRecords(TABLES.adminAudit, primaryBase(), [
    {
      [f.action]: action,
      [f.actorEmail]: normalizeEmail(actorEmail),
      [f.targetEmail]: normalizeEmail(targetEmail),
      [f.at]: new Date().toISOString(),
      ...(note ? { [f.note]: note } : {}),
    },
  ]);
}

export interface AdminUserRow {
  id: string;
  email: string;
  name?: string;
  accountStatus?: string;
  onboardingStatus?: string;
  defaultTargets?: string;
  lastLogin?: string;
}

/** ALL Users rows — cross-user by definition. Call sites must co-occur with
 *  requireAdmin/requireAdminApi (G12 scan). */
export async function listUsersAllAdmin(): Promise<AdminUserRow[]> {
  const f = FIELDS.users;
  const records = await fetchAllRecords(usersTable(), primaryBase(), { fresh: true });
  return records.map((r) => ({
    id: r.id,
    email: normalizeEmail(String(r.fields[f.email] ?? "")),
    name: r.fields[f.name] as string | undefined,
    accountStatus: selectName(r.fields[f.accountStatus]),
    onboardingStatus: selectName(r.fields[f.onboardingStatus]),
    defaultTargets: selectName(r.fields[f.defaultTargets]),
    lastLogin: r.fields[f.lastLogin] as string | undefined,
  }));
}

export interface UserTargetRow {
  id: string;
  userEmail: string;
  companyKey: string;
  status?: string; // "excluded" | "added"
  companyName?: string;
  careersUrl?: string;
  h1bVerified: boolean;
}

/** Sparse per-user target deviations (PRD D8). UserTargets is user-scoped:
 *  always owner-filtered on its own "User Email" column (same frozen name). */
export async function listUserTargets(userEmail: string): Promise<UserTargetRow[]> {
  const f = FIELDS.userTargets;
  const records = postFilterOwned(
    await fetchAllRecords(TABLES.userTargets, primaryBase(), {
      fresh: true,
      filterByFormula: ownerFilter(userEmail),
    }),
    f.userEmail,
    userEmail,
    "userTargets",
  );
  return records.map((r) => ({
    id: r.id,
    userEmail: normalizeEmail(String(r.fields[f.userEmail] ?? "")),
    companyKey: (r.fields[f.companyKey] as string) ?? "",
    status: selectName(r.fields[f.status]),
    companyName: r.fields[f.companyName] as string | undefined,
    careersUrl: r.fields[f.careersUrl] as string | undefined,
    h1bVerified: Boolean(r.fields[f.h1bVerified]),
  }));
}

// Blank-owner predicate: a DELIBERATE, internal-only exception to the
// "ownerFilter on every owned read" rule (PRD §6.6 step 3). Used ONLY by the
// migration backfill and the gated health detail to find rows not yet stamped.
// Never expose this through any user-facing read path.
/* tenancy-exception: blank-owner scan — migration/health internal use only */
function blankOwnerFormula(): string {
  return `{${FIELD_NAMES.ownerField}} = ''`;
}

/** Record ids of rows with a BLANK owner (migration backfill cursor page).
 *  Fresh read; capped at `limit`. Internal-only — see blankOwnerFormula note. */
export async function listUnstampedRecordIds(
  tableKey: OwnedTableKey,
  baseId: string,
  limit = 100,
): Promise<string[]> {
  const records = await fetchAllRecords(TABLES[tableKey], baseId, {
    fresh: true,
    filterByFormula: blankOwnerFormula(),
  });
  return records.slice(0, Math.max(0, limit)).map((r) => r.id);
}

/** Count of blank-owner rows (gated health detail block; 0 = backfill done).
 *  Capped by fetchAllRecords' 10-page scan — fine as a "is it zero" probe. */
export async function countUnstamped(tableKey: OwnedTableKey): Promise<number> {
  const records = await fetchAllRecords(TABLES[tableKey], ownedBase(tableKey), {
    fresh: true,
    filterByFormula: blankOwnerFormula(),
  });
  return records.length;
}

// ── Workflow_Runs (run log) ──────────────────────────────────────────────────

export async function listWorkflowRuns(userEmail: string, limit = 50): Promise<WorkflowRun[]> {
  const f = FIELDS.workflowRuns;
  const records = postFilterOwned(
    await fetchAllRecords(TABLES.workflowRuns, primaryBase(), {
      filterByFormula: ownerFilter(userEmail),
    }),
    f.userEmail,
    userEmail,
    "workflowRuns",
  );
  const runs: WorkflowRun[] = records.map((r) => ({
    id: r.id,
    label: (r.fields[f.run] as string) ?? "—",
    workflow: selectName(r.fields[f.workflow]) as WorkflowName | undefined,
    trigger: selectName(r.fields[f.trigger]),
    status: selectName(r.fields[f.status]),
    startedAt: r.fields[f.startedAt] as string | undefined,
    finishedAt: r.fields[f.finishedAt] as string | undefined,
    counts: r.fields[f.counts] as string | undefined,
    notes: r.fields[f.notes] as string | undefined,
  }));
  // Newest first by start time.
  runs.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  return runs.slice(0, limit);
}

export async function createWorkflowRun(input: {
  workflow: WorkflowName;
  trigger: WorkflowTrigger;
  ownerEmail: string; // engine identity — every run row is owner-stamped (PRD §5.6)
  label?: string;
}): Promise<string> {
  const f = FIELDS.workflowRuns;
  const startedAt = new Date().toISOString();
  const label =
    input.label ?? `${startedAt.slice(0, 16).replace("T", " ")} — ${input.workflow}`;
  const [rec] = await createRecords(TABLES.workflowRuns, primaryBase(), [
    withOwner(
      "workflowRuns",
      {
        [f.run]: label,
        [f.workflow]: input.workflow,
        [f.trigger]: input.trigger,
        [f.status]: "running",
        [f.startedAt]: startedAt,
      },
      input.ownerEmail,
    ),
  ]);
  return rec.id;
}

export async function updateWorkflowRun(
  id: string,
  patch: {
    status?: "running" | "success" | "partial" | "failed";
    counts?: Record<string, number>;
    notes?: string;
    finished?: boolean;
  },
): Promise<void> {
  const f = FIELDS.workflowRuns;
  const fields: Record<string, unknown> = {};
  if (patch.status) fields[f.status] = patch.status;
  if (patch.counts) fields[f.counts] = JSON.stringify(patch.counts);
  if (patch.notes !== undefined) fields[f.notes] = patch.notes;
  if (patch.finished) fields[f.finishedAt] = new Date().toISOString();
  if (Object.keys(fields).length === 0) return;
  await updateRecords(TABLES.workflowRuns, primaryBase(), [{ id, fields }]);
}

export function summarize(
  targets: TargetCompany[],
  listings: JobListing[],
  outreach: OutreachContact[],
  applications: Application[],
): PipelineSummary {
  const count = <T,>(arr: T[], pred: (t: T) => boolean) => arr.filter(pred).length;

  return {
    targets: targets.length,
    listings: {
      total: listings.length,
      new: count(listings, (l) => l.status === "new"),
      applied: count(listings, (l) => l.status === "applied"),
    },
    outreach: {
      total: outreach.length,
      // "Sent" covers both bases: Outreach.Status = Sent|Contacted, Leads.Status = sent
      sent: count(outreach, (o) =>
        ["Sent", "Contacted", "sent", "followed_up"].includes(o.status ?? ""),
      ),
      // "Replied" covers Outreach.Status = Replied, Leads.Status = responded
      replied: count(outreach, (o) => ["Replied", "responded"].includes(o.status ?? "")),
    },
    applications: {
      total: applications.length,
      submitted: count(applications, (a) => a.status === "submitted"),
      interviewing: count(applications, (a) => a.status === "interviewing"),
      offered: count(applications, (a) => a.status === "offered"),
      rejected: count(applications, (a) => a.status === "rejected"),
    },
    funnel: [
      { stage: "Targets", count: targets.length },
      { stage: "Listings", count: listings.length },
      { stage: "Outreach", count: outreach.length },
      { stage: "Applied", count: applications.length },
      { stage: "Interviewing", count: count(applications, (a) => a.status === "interviewing") },
      { stage: "Offered", count: count(applications, (a) => a.status === "offered") },
    ],
  };
}
