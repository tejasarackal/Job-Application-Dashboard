// Server-side fetch helper for our own API routes. We import data directly
// from the lib functions inside server components (faster, no HTTP hop),
// but expose this for the few places that need the ApiResponse envelope
// (e.g., the source badge on the overview).
import {
  isConfigured as airtableConfigured,
  listLeads,
  listApplications,
  listInterviews,
  listJobListings,
  listTargets,
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
} from "./types";

async function wrap<T>(
  configured: boolean,
  live: () => Promise<T>,
  mock: T,
): Promise<ApiResponse<T>> {
  if (!configured) return { ok: true, source: "mock", data: mock };
  try {
    return { ok: true, source: "live", data: await live() };
  } catch (e) {
    return { ok: false, source: "mock", data: mock, error: (e as Error).message };
  }
}

export const getListings = () =>
  wrap<JobListing[]>(airtableConfigured(), listJobListings, mockListings);

// Outreach reads from the Leads table only (Automation Dev Outreach base) —
// the source of truth for job-search reachouts.
export const getOutreach = () =>
  wrap<OutreachContact[]>(airtableConfigured(), listLeads, mockOutreach);

export const getApplications = () =>
  wrap<Application[]>(airtableConfigured(), listApplications, mockApplications);

export const getInterviews = () =>
  wrap<Interview[]>(airtableConfigured(), listInterviews, mockInterviews);

export const getTargets = () =>
  wrap<TargetCompany[]>(airtableConfigured(), listTargets, mockTargets);

export const getSequences = () =>
  wrap<ApolloSequence[]>(apolloConfigured(), listSequences, mockApolloSequences);

export const getApifyRuns = () =>
  wrap<ApifyRun[]>(apifyConfigured(), () => recentRuns(8), mockApifyRuns);

export const getGmailThreads = () =>
  wrap<GmailThread[]>(gmailConfigured(), () => recentThreads(15), mockGmailThreads);

export async function getSummary(): Promise<ApiResponse<PipelineSummary>> {
  if (!airtableConfigured()) return { ok: true, source: "mock", data: mockSummary };
  try {
    const [targets, listings, outreach, applications] = await Promise.all([
      listTargets(),
      listJobListings(),
      listLeads(), // Leads table = outreach source of truth
      listApplications(),
    ]);
    return {
      ok: true,
      source: "live",
      data: summarize(targets, listings, outreach, applications),
    };
  } catch (e) {
    return { ok: false, source: "mock", data: mockSummary, error: (e as Error).message };
  }
}
