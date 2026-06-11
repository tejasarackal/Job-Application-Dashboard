// Server-side fetch helper for our own API routes. We import data directly
// from the lib functions inside server components (faster, no HTTP hop),
// but expose this for the few places that need the ApiResponse envelope
// (e.g., the source badge on the overview).
//
// Tenancy (PRD-multi-user 2.10): every getter over OWNED data takes the
// caller's `userEmail` (pages pass `ctx.effectiveEmail` from getViewContext)
// and threads it down to the owner-filtered airtable reads. Unowned/shared
// reads (targets, Apollo, Apify, Gmail viewer) are unchanged.
//
// Prod mock rule (PRD §5.4): `wrap` may return `source:"mock"` ONLY outside
// production. In production any failure/unconfigured state returns
// `{ok:false, source:"live", data:<empty shape>, error:<generic>}` — never
// fixtures (fixture data inside another user's session is indistinguishable
// from a breach, CR-S7), never raw Airtable error text (logged server-side).
import {
  isConfigured as airtableConfigured,
  listLeads,
  listApplications,
  listInterviews,
  listJobListings,
  listTargets,
  listWorkflowRuns,
  summarize,
} from "./airtable";
import { isConfigured as apolloConfigured, listSequences } from "./apollo";
import { isConfigured as apifyConfigured, recentRuns } from "./apify";
import { isConfigured as gmailConfigured, recentThreads } from "./gmail";
import {
  mockApifyRuns,
  mockApolloSequences,
  mockApplications,
  mockGmailThreads,
  mockInterviews,
  mockListings,
  mockOutreach,
  mockSummary,
  mockTargets,
} from "./mock";
import type {
  ApiResponse,
  ApifyRun,
  ApolloSequence,
  Application,
  GmailThread,
  Interview,
  JobListing,
  OutreachContact,
  PipelineSummary,
  TargetCompany,
  WorkflowRun,
} from "./types";

const isProd = () => process.env.NODE_ENV === "production";

// Client-facing error strings are generic by design; the real error goes to
// the server log only.
const GENERIC_ERROR = "data temporarily unavailable";

async function wrap<T>(
  configured: boolean,
  live: () => Promise<T>,
  mock: T,
  empty: T,
): Promise<ApiResponse<T>> {
  if (!configured) {
    if (isProd()) return { ok: false, source: "live", data: empty, error: GENERIC_ERROR };
    return { ok: true, source: "mock", data: mock };
  }
  try {
    return { ok: true, source: "live", data: await live() };
  } catch (e) {
    console.error("fetcher: live read failed", e);
    if (isProd()) return { ok: false, source: "live", data: empty, error: GENERIC_ERROR };
    return { ok: false, source: "mock", data: mock, error: (e as Error).message };
  }
}

// Fresh read so status edits + new scrape results show immediately (no 30s lag).
export const getListings = (userEmail: string) =>
  wrap<JobListing[]>(
    airtableConfigured(),
    () => listJobListings(userEmail, { fresh: true }),
    mockListings,
    [],
  );

// Outreach reads from the Leads table only (Automation Dev Outreach base) —
// the source of truth for job-search reachouts.
export const getOutreach = (userEmail: string) =>
  wrap<OutreachContact[]>(airtableConfigured(), () => listLeads(userEmail), mockOutreach, []);

export const getApplications = (userEmail: string) =>
  wrap<Application[]>(airtableConfigured(), () => listApplications(userEmail), mockApplications, []);

export const getInterviews = (userEmail: string) =>
  wrap<Interview[]>(airtableConfigured(), () => listInterviews(userEmail), mockInterviews, []);

// Shared H1B master list — unowned by design (PRD §6.3): no userEmail.
export const getTargets = () =>
  wrap<TargetCompany[]>(airtableConfigured(), listTargets, mockTargets, []);

export const getWorkflowRuns = (userEmail: string) =>
  wrap<WorkflowRun[]>(airtableConfigured(), () => listWorkflowRuns(userEmail), [], []);

export const getSequences = () =>
  wrap<ApolloSequence[]>(apolloConfigured(), listSequences, mockApolloSequences, []);

export const getApifyRuns = () =>
  wrap<ApifyRun[]>(apifyConfigured(), () => recentRuns(8), mockApifyRuns, []);

export const getGmailThreads = () =>
  wrap<GmailThread[]>(gmailConfigured(), () => recentThreads(15), mockGmailThreads, []);

// Empty-but-well-formed summary for the prod failure path (never fixtures).
const emptySummary = (): PipelineSummary => summarize([], [], [], []);

export async function getSummary(userEmail: string): Promise<ApiResponse<PipelineSummary>> {
  if (!airtableConfigured()) {
    if (isProd()) return { ok: false, source: "live", data: emptySummary(), error: GENERIC_ERROR };
    return { ok: true, source: "mock", data: mockSummary };
  }
  try {
    const [targets, listings, outreach, applications] = await Promise.all([
      listTargets(), // shared master — unowned
      listJobListings(userEmail),
      listLeads(userEmail), // Leads table = outreach source of truth
      listApplications(userEmail),
    ]);
    return {
      ok: true,
      source: "live",
      data: summarize(targets, listings, outreach, applications),
    };
  } catch (e) {
    console.error("fetcher: summary read failed", e);
    if (isProd()) return { ok: false, source: "live", data: emptySummary(), error: GENERIC_ERROR };
    return { ok: false, source: "mock", data: mockSummary, error: (e as Error).message };
  }
}
