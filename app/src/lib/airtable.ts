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
  TargetCompany,
  PipelineSummary,
} from "./types";

const API = "https://api.airtable.com/v0";

// Table + field IDs come from the live schema of base `app8aBP9UPmxYaEgI`.
// If the user adds/removes columns these may need to be regenerated.
export const TABLES = {
  outreach: "tblr7L5KixQqQxrxG",
  h1bCompanies: "tblGVG4F5cTrAoaoh",
  jobListings: "tbl4VpyV2wysMPrxL",
  applications: "tblRFVT8JwGccOHsv",
  interviews: "tblq3kP2aT6mOTn6N",
  // Second base: Automation Dev Outreach (appkusCXgR7KcEmLO).
  // Used as a secondary outreach tracker (sourced/automated leads).
  leads: "tblI5KPof3PmTjDmY",
};

// Default base IDs — overridable via env vars in case the user clones the
// bases. Same token works for both since they're in the same workspace.
const DEFAULT_PRIMARY_BASE = "app8aBP9UPmxYaEgI";
const DEFAULT_LEADS_BASE = "appkusCXgR7KcEmLO";

function primaryBase(): string {
  return process.env.AIRTABLE_BASE_ID || DEFAULT_PRIMARY_BASE;
}
function leadsBase(): string {
  return process.env.AIRTABLE_LEADS_BASE_ID || DEFAULT_LEADS_BASE;
}

const FIELDS = {
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
      // Cache for 30s server-side to avoid hammering Airtable.
      next: { revalidate: 30 },
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

export async function listJobListings(): Promise<JobListing[]> {
  const records = await fetchAllRecords(TABLES.jobListings, primaryBase());
  return records.map((r) => ({
    id: r.id,
    title: (r.fields[FIELDS.jobListings.title] as string) ?? "Untitled",
    company: (r.fields[FIELDS.jobListings.company] as string) ?? "—",
    url: r.fields[FIELDS.jobListings.url] as string | undefined,
    board: selectName(r.fields[FIELDS.jobListings.board]),
    location: r.fields[FIELDS.jobListings.location] as string | undefined,
    remote: Boolean(r.fields[FIELDS.jobListings.remote]),
    status: selectName(r.fields[FIELDS.jobListings.status]),
    skipReason: selectName(r.fields[FIELDS.jobListings.skipReason]),
    salary: r.fields[FIELDS.jobListings.salary] as string | undefined,
    scrapedAt: r.fields[FIELDS.jobListings.scrapedAt] as string | undefined,
    h1bVerified: Boolean(r.fields[FIELDS.jobListings.h1bVerified]),
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

// Leads = the second outreach tracker (Automation Dev Outreach base).
// We normalize Leads rows into the same OutreachContact shape so the UI
// can treat both the same way, with a `source` discriminator.
export async function listLeads(): Promise<OutreachContact[]> {
  const records = await fetchAllRecords(TABLES.leads, leadsBase());
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
      recentSignal: r.fields[FIELDS.leads.recentSignal] as string | undefined,
    };
  });
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
  return records.map((r) => ({
    id: r.id,
    employer: (r.fields[FIELDS.h1bCompanies.employer] as string) ?? "—",
    sector: r.fields[FIELDS.h1bCompanies.sector] as string | undefined,
    city: r.fields[FIELDS.h1bCompanies.city] as string | undefined,
    lcaCount: r.fields[FIELDS.h1bCompanies.lcaCount] as number | undefined,
    status: selectName(r.fields[FIELDS.h1bCompanies.status]),
    bayArea: Boolean(r.fields[FIELDS.h1bCompanies.bayArea]),
    remoteFriendly: Boolean(r.fields[FIELDS.h1bCompanies.remoteFriendly]),
  }));
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
