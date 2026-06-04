// Mock data used when an integration's env vars aren't set. Lets the
// dashboard render meaningfully on first deploy before credentials are wired.
import type {
  Application,
  ApifyRun,
  ApolloSequence,
  GmailThread,
  Interview,
  JobListing,
  OutreachContact,
  PipelineSummary,
  TargetCompany,
} from "./types";

export const mockListings: JobListing[] = [
  {
    id: "rec_l1",
    title: "Senior Staff Data Engineer, Marketplaces DNA",
    company: "Airbnb",
    board: "Greenhouse",
    location: "United States (Remote)",
    remote: true,
    status: "applied",
    scrapedAt: "2026-05-26",
    h1bVerified: true,
  },
  {
    id: "rec_l2",
    title: "Data Engineer III, Analytics Platform",
    company: "Stripe",
    board: "Greenhouse",
    location: "South San Francisco, CA",
    remote: false,
    status: "approved",
    scrapedAt: "2026-05-27",
    h1bVerified: true,
  },
  {
    id: "rec_l3",
    title: "Senior Data Engineer",
    company: "Databricks",
    board: "Lever",
    location: "San Francisco, CA",
    remote: false,
    status: "review_pending",
    scrapedAt: "2026-05-27",
    h1bVerified: true,
  },
  {
    id: "rec_l4",
    title: "Data Platform Engineer",
    company: "Snowflake",
    board: "Workday",
    location: "Remote — US",
    remote: true,
    status: "new",
    scrapedAt: "2026-05-28",
    h1bVerified: true,
  },
  {
    id: "rec_l5",
    title: "Staff Analytics Engineer",
    company: "Notion",
    board: "Greenhouse",
    location: "San Francisco, CA",
    remote: false,
    status: "queued",
    scrapedAt: "2026-05-28",
    h1bVerified: true,
  },
];

export const mockOutreach: OutreachContact[] = [
  // Outreach base (manual)
  { id: "rec_o1", source: "outreach", company: "nvidia.com", contactName: "Sarah Park", channel: "Email+LinkedIn", status: "Drafted", date: "2026-05-26" },
  { id: "rec_o2", source: "outreach", company: "dbtlabs.com", contactName: "Tristan Handy", channel: "Email+LinkedIn", status: "Sent", date: "2026-05-25" },
  { id: "rec_o3", source: "outreach", company: "salesforce.com", contactName: "Gayathri Balachandra", channel: "Email+LinkedIn", status: "Contacted", date: "2026-05-25" },
  { id: "rec_o4", source: "outreach", company: "linkedin.com", contactName: "Elisa Herpin", channel: "Email+LinkedIn", status: "Replied", date: "2026-05-22" },
  { id: "rec_o5", source: "outreach", company: "stripe.com", contactName: "Patrick Collison", channel: "Email", status: "No Reply", date: "2026-05-18" },
  { id: "rec_o6", source: "outreach", company: "airbnb.com", contactName: "Brian Chesky", channel: "LinkedIn", status: "Interviewing", date: "2026-05-15", interviewStage: "Phone Screen" },
  // Leads base (sourced/automated)
  { id: "rec_lead1", source: "leads", company: "Apple", contactName: "Mahesh Molakalapalli", title: "Senior Manager & Head of Data Engineering — App Store", channel: "cold_email", status: "sent", date: "2026-05-26", hiringSignal: "job_posting", roleLevel: "Senior" },
  { id: "rec_lead2", source: "leads", company: "Airbnb", contactName: "Taylor Thompson", title: "Technical Recruiter, Engineering", channel: "cold_email", status: "sent", date: "2026-05-26", hiringSignal: "job_posting", roleLevel: "Senior" },
  { id: "rec_lead3", source: "leads", company: "LinkedIn", contactName: "Alex Busuttil", title: "Technical Recruiter, Engineering", channel: "cold_email", status: "responded", date: "2026-05-26", hiringSignal: "job_posting", roleLevel: "Senior" },
  { id: "rec_lead4", source: "leads", company: "NVIDIA", contactName: "Candace Millar", title: "Talent Acquisition Specialist", channel: "cold_email", status: "sent", date: "2026-05-26", hiringSignal: "job_posting", roleLevel: "Senior" },
  { id: "rec_lead5", source: "leads", company: "Workday", contactName: "Jessica Tallerico", title: "Talent Acquisition Specialist", channel: "linkedin", status: "draft", date: "2026-05-27", hiringSignal: "job_posting", roleLevel: "Senior" },
];

export const mockApplications: Application[] = [
  { id: "rec_a1", applicationId: "AIRBNB-7463663-20260526", company: "Airbnb", jobTitle: "Senior Staff Data Engineer, Marketplaces DNA", board: "Greenhouse", status: "interviewing", interviewStage: "Recruiter Screen", submittedAt: "2026-05-26" },
  { id: "rec_a2", applicationId: "stripe-de-iii-20260524", company: "Stripe", jobTitle: "Data Engineer III", board: "Greenhouse", status: "submitted", submittedAt: "2026-05-24" },
  { id: "rec_a3", applicationId: "kikoff-unknown-role-2026-05-27", company: "Kikoff", jobTitle: "Unknown — see Kikoff email", board: "Other", status: "rejected", submittedAt: "2026-05-27" },
  { id: "rec_a4", applicationId: "floqast-solutions-data-eng-2026-05-27", company: "FloQast", jobTitle: "Solutions Data Engineer", board: "Lever", status: "rejected", submittedAt: "2026-05-27" },
  { id: "rec_a5", applicationId: "ibm-ai-data-eng-2026-05-26", company: "IBM", jobTitle: "AI & Data Engineer", board: "Other", status: "rejected", submittedAt: "2026-05-26" },
];

export const mockInterviews: Interview[] = [
  { id: "rec_iv1", label: "Airbnb — Recruiter Screen", company: "Airbnb", role: "Senior Staff Data Engineer, Marketplaces DNA", interviewer: "Sarah Park", interviewerTitle: "Technical Recruiter", callLink: "https://airbnb.zoom.us/j/123456", stage: "Recruiter Screen", status: "Scheduled", scheduledAt: "2026-06-02T16:00:00Z", nextFollowUp: "2026-06-03T17:00:00Z", lastUpdated: "2026-05-28" },
];

export const mockTargets: TargetCompany[] = [
  { id: "rec_t1", employer: "Google LLC", sector: "Tech", city: "Mountain View CA", lcaCount: 770, status: "done", bayArea: true, remoteFriendly: false, ats: "custom", careersUrl: "https://careers.google.com" },
  { id: "rec_t2", employer: "Confluent Inc.", sector: "Tech", city: "Mountain View CA", lcaCount: 38, status: "pending", bayArea: true, remoteFriendly: true, ats: "greenhouse", careersUrl: "https://www.confluent.io/careers" },
  { id: "rec_t3", employer: "Fortinet Inc.", sector: "Tech", city: "Sunnyvale CA", lcaCount: 36, status: "pending", bayArea: true, remoteFriendly: false, ats: "workday", careersUrl: "https://www.fortinet.com/corporate/about-us/careers" },
  { id: "rec_t4", employer: "Databricks Inc.", sector: "Data", city: "San Francisco CA", lcaCount: 142, status: "in_progress", bayArea: true, remoteFriendly: true, ats: "greenhouse", careersUrl: "https://www.databricks.com/company/careers" },
  { id: "rec_t5", employer: "Snowflake Inc.", sector: "Data", city: "Dublin CA", lcaCount: 220, status: "in_progress", bayArea: true, remoteFriendly: true, ats: "greenhouse", careersUrl: "https://careers.snowflake.com" },
];

export const mockApolloSequences: ApolloSequence[] = [
  { id: "seq_1", name: "DE Recruiter Cold Touch — Bay Area", active: true, numContacts: 38, numSent: 36, numOpened: 22, numReplied: 4 },
  { id: "seq_2", name: "H1B Founder Warm Intro Ask", active: true, numContacts: 14, numSent: 12, numOpened: 9, numReplied: 3 },
];

export const mockApifyRuns: ApifyRun[] = [
  { id: "run_1", actorId: "actor_gh", actorName: "Greenhouse Job Board Scraper", status: "SUCCEEDED", startedAt: "2026-05-28T06:00:00Z", finishedAt: "2026-05-28T06:04:11Z", itemCount: 247 },
  { id: "run_2", actorId: "actor_lever", actorName: "Lever Postings Scraper", status: "SUCCEEDED", startedAt: "2026-05-28T05:00:00Z", finishedAt: "2026-05-28T05:02:33Z", itemCount: 89 },
  { id: "run_3", actorId: "actor_li", actorName: "LinkedIn Jobs Scraper", status: "RUNNING", startedAt: "2026-05-28T07:30:00Z" },
  { id: "run_4", actorId: "actor_wd", actorName: "Workday Jobs Scraper", status: "FAILED", startedAt: "2026-05-27T22:00:00Z", finishedAt: "2026-05-27T22:01:08Z", itemCount: 0 },
];

export const mockGmailThreads: GmailThread[] = [
  { id: "thr_1", subject: "Re: Curious about Data Platform roles at Airbnb", from: "Sarah Park <sarah.park@airbnb.com>", snippet: "Hi Tejas — thanks for reaching out. Let's set up a 30-min chat next week...", date: "Tue, 27 May 2026 09:14:22 -0700", unread: true },
  { id: "thr_2", subject: "Re: Senior DE referral?", from: "Tristan Handy <tristan@dbtlabs.com>", snippet: "Happy to refer you in — can you send me your latest resume and what teams interest you?", date: "Mon, 26 May 2026 17:02:11 -0700", unread: false },
  { id: "thr_3", subject: "Application received — Stripe Data Engineer III", from: "Stripe Recruiting <noreply@stripe.com>", snippet: "Thanks for your interest in Stripe. We've received your application and will be in touch...", date: "Sat, 24 May 2026 11:47:00 -0700", unread: false },
];

export const mockSummary: PipelineSummary = {
  targets: 151,
  listings: { total: 5, new: 1, applied: 1 },
  // Merged across Outreach + Leads bases.
  outreach: { total: 11, sent: 6, replied: 2 },
  applications: { total: 5, submitted: 1, interviewing: 1, offered: 0, rejected: 3 },
  funnel: [
    { stage: "Targets", count: 151 },
    { stage: "Listings", count: 5 },
    { stage: "Outreach", count: 11 },
    { stage: "Applied", count: 1 },
    { stage: "Interviewing", count: 1 },
    { stage: "Offered", count: 0 },
  ],
};
