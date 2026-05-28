// Shared types for the dashboard. These mirror the Airtable schema so the
// frontend doesn't need to know about field IDs.

export type StatusColor =
  | "blue" | "cyan" | "teal" | "green" | "yellow"
  | "orange" | "red" | "pink" | "purple" | "gray";

export interface JobListing {
  id: string;
  title: string;
  company: string;
  url?: string;
  board?: string;
  location?: string;
  remote?: boolean;
  status?: string;
  skipReason?: string;
  salary?: string;
  scrapedAt?: string;
  h1bVerified?: boolean;
}

// `source` distinguishes the two outreach trackers in Airtable:
//   - 'outreach' = Job Outreach base, Outreach table (manual pipeline)
//   - 'leads'    = Automation Dev Outreach base, Leads table (sourced/automated)
export type OutreachSource = "outreach" | "leads";

export interface OutreachContact {
  id: string;
  source: OutreachSource;
  company: string;
  contactName?: string;
  title?: string;
  email?: string;
  linkedin?: string;
  channel?: string;
  status?: string;
  date?: string;
  followUpNeeded?: boolean;
  lastCommunication?: string;
  interviewStage?: string;
  threadId?: string;
  // Lead-specific extras (only populated when source === 'leads')
  hiringSignal?: string;
  roleLevel?: string;
  companyStage?: string;
  recentSignal?: string;
}

export interface Application {
  id: string;
  applicationId: string;
  company: string;
  jobTitle: string;
  jobUrl?: string;
  status?: string;
  submittedAt?: string;
  interviewStage?: string;
  board?: string;
  followUpDate?: string;
  followUpDone?: boolean;
}

export interface Interview {
  id: string;
  label?: string;
  company: string;
  role?: string;
  interviewer?: string;
  interviewerTitle?: string;
  callLink?: string;
  stage?: string;
  status?: string;
  scheduledAt?: string;
  nextFollowUp?: string;
  lastUpdated?: string;
  jobPostingUrl?: string;
  notes?: string;
}

export interface TargetCompany {
  id: string;
  employer: string;
  sector?: string;
  city?: string;
  lcaCount?: number;
  status?: string;
  bayArea?: boolean;
  remoteFriendly?: boolean;
}

export interface ApolloSequence {
  id: string;
  name: string;
  active: boolean;
  numContacts: number;
  numSent?: number;
  numOpened?: number;
  numReplied?: number;
}

export interface ApifyRun {
  id: string;
  actorId: string;
  actorName: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  itemCount?: number;
}

export interface GmailThread {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  unread?: boolean;
}

export interface PipelineSummary {
  targets: number;
  listings: { total: number; new: number; applied: number };
  outreach: { total: number; sent: number; replied: number };
  applications: {
    total: number;
    interviewing: number;
    offered: number;
    rejected: number;
    submitted: number;
  };
  funnel: Array<{ stage: string; count: number }>;
}

// Generic envelope for our API routes so the client can detect mock fallback.
export interface ApiResponse<T> {
  ok: boolean;
  source: "live" | "mock";
  data: T;
  error?: string;
}
