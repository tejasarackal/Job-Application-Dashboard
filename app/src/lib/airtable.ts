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
};

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
  },
};

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
  opts?: { fresh?: boolean },
): Promise<AirtableRecord[]> {
  const token = process.env.AIRTABLE_TOKEN;
  const base = baseId ?? primaryBase();
  if (!token) throw new Error("Airtable not configured");

  const records: AirtableRecord[] = [];
  let offset: string | undefined;
  // Cap to a few pages to keep response time reasonable.
  for (let i = 0; i < 10; i++) {
    const url = new URL(`${API}/${base}/${table}`);
    url.searchParams.set("pageSize", "100");
    // Return field IDs as keys (not names) — all our FIELDS maps use stable IDs.
    url.searchParams.set("returnFieldsByFieldId", "true");
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

export async function listJobListings(opts?: { fresh?: boolean }): Promise<JobListing[]> {
  const records = await fetchAllRecords(TABLES.jobListings, primaryBase(), opts);
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

export async function listOutreach(): Promise<OutreachContact[]> {
  const records = await fetchAllRecords(TABLES.outreach, primaryBase());
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
export async function listLeads(opts?: { fresh?: boolean }): Promise<OutreachContact[]> {
  const records = await fetchAllRecords(TABLES.leads, leadsBase(), opts);
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
export async function listAllOutreach(): Promise<OutreachContact[]> {
  const [a, b] = await Promise.all([listOutreach(), listLeads()]);
  return [...a, ...b].sort((x, y) => (y.date ?? "").localeCompare(x.date ?? ""));
}

export async function listApplications(): Promise<Application[]> {
  const records = await fetchAllRecords(TABLES.applications, primaryBase());
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

export async function listInterviews(): Promise<Interview[]> {
  const records = await fetchAllRecords(TABLES.interviews, primaryBase());
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

// ── Workflow_Runs (run log) ──────────────────────────────────────────────────

export async function listWorkflowRuns(limit = 50): Promise<WorkflowRun[]> {
  const f = FIELDS.workflowRuns;
  const records = await fetchAllRecords(TABLES.workflowRuns, primaryBase());
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
  label?: string;
}): Promise<string> {
  const f = FIELDS.workflowRuns;
  const startedAt = new Date().toISOString();
  const label =
    input.label ?? `${startedAt.slice(0, 16).replace("T", " ")} — ${input.workflow}`;
  const [rec] = await createRecords(TABLES.workflowRuns, primaryBase(), [
    {
      [f.run]: label,
      [f.workflow]: input.workflow,
      [f.trigger]: input.trigger,
      [f.status]: "running",
      [f.startedAt]: startedAt,
    },
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
