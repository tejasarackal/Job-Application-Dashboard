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
  Ashby: "purple",
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
  // Interviews.Stage — a distinct color per stage (was: HM/System Design/
  // Behavioral/Interview all fell through to gray). Offer="red" via Outreach above.
  "Hiring Manager": "teal",
  "System Design": "cyan",
  Behavioral: "pink",
  Interview: "green",
  // Interviews.Status — these had no entry → gray; give each a color.
  Scheduled: "blue",
  "Awaiting Feedback": "yellow",
  Passed: "green",
  Completed: "teal",
  Cancelled: "gray",
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

// Values that should read as "no value" rather than a literal badge.
const EMPTY_STATUS = new Set(["", "unknown", "none", "n/a", "na", "null", "undefined"]);

// Casing/spelling the generic humanizer can't infer. Keep this small — only
// add entries the auto rule gets wrong.
const STATUS_LABEL_OVERRIDES: Record<string, string> = {
  linkedin: "LinkedIn",
  "email+linkedin": "Email + LinkedIn",
};

// Turn a raw enum value (`cold_email`, `review_pending`, `in_progress`) into a
// readable label ("Cold email", "Review pending", "In progress"). Leaves
// already-cased labels ("LinkedIn", "Recruiter Screen", "Workday") untouched so
// we never mangle proper nouns. Returns "" for empty/unknown sentinels.
export function humanizeStatus(label?: string | null): string {
  if (!label) return "";
  const key = label.trim().toLowerCase();
  if (EMPTY_STATUS.has(key)) return "";
  if (STATUS_LABEL_OVERRIDES[key]) return STATUS_LABEL_OVERRIDES[key];
  // Only transform "rawish" enums (all-lowercase or with separators); a label
  // that already carries uppercase or spaces is assumed display-ready.
  const rawish = label === label.toLowerCase() || /[_-]/.test(label);
  if (!rawish) return label;
  const spaced = label.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
