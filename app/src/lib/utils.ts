import type { StatusColor } from "./types";

// Map status name → palette key. Single source of truth so badges stay
// consistent across pages.
const STATUS_PALETTE: Record<string, StatusColor> = {
  // Outreach.Status
  Drafted: "blue",
  Sent: "cyan",
  Contacted: "blue",
  Replied: "teal",
  "No Reply": "green",
  "No Response": "teal",
  Bounced: "cyan",
  "Awaiting Review": "yellow",
  Interviewing: "orange",
  Offer: "red",
  Rejected: "pink",
  // Outreach.Channel
  Email: "blue",
  LinkedIn: "cyan",
  "Email+LinkedIn": "teal",
  Phone: "blue",
  // Job_Listings.Status
  new: "blue",
  queued: "purple",
  review_pending: "yellow",
  approved: "teal",
  applied: "green",
  skipped: "gray",
  // Job_Listings.Board / Applications.Board
  Greenhouse: "green",
  Lever: "blue",
  Workday: "orange",
  Other: "gray",
  // Applications.Status
  submitted: "blue",
  interviewing: "yellow",
  offered: "green",
  rejected: "red",
  withdrawn: "gray",
  ghosted: "pink",
  // Applications.InterviewStage
  "Recruiter Screen": "blue",
  "Technical Screen": "purple",
  "Take Home": "yellow",
  "Onsite / Final": "orange",
  "Phone Screen": "gray",
  Technical: "gray",
  Final: "gray",
  // H1B_Companies.Status
  pending: "gray",
  in_progress: "yellow",
  done: "green",
  // Leads.Status (Automation Dev Outreach base)
  research: "blue",
  draft: "teal",
  sent: "cyan",
  followed_up: "yellow",
  responded: "orange",
  closed: "red",
  // Leads.Channel
  cold_email: "blue",
  linkedin: "cyan",
  referral: "teal",
  // Leads.HiringSignal
  job_posting: "blue",
  leadership_change: "cyan",
  tech_pivot: "teal",
  funding: "green",
  // Leads.RoleLevel
  Senior: "blue",
  Staff: "cyan",
  Principal: "teal",
  // Leads.CompanyStage
  startup: "blue",
  growth: "cyan",
  enterprise: "teal",
};

export function statusColor(name?: string | null): StatusColor {
  if (!name) return "gray";
  return STATUS_PALETTE[name] ?? "gray";
}

export function classNames(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(" ");
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatRelative(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function pct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}
