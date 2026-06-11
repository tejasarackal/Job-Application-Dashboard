// quota.ts — per-user weekly run caps (PRD-multi-user Phase 3: "owner pays,
// with per-user caps"). No new table: the Workflow_Runs log IS the usage
// ledger. Every member-triggered run writes a row stamped to the actor
// (withRunLog / scrapeJobs' createWorkflowRun), so the cap check just counts
// this week's rows for that workflow. The owner is exempt; unmetered workflows
// (no cap configured) are always allowed.
//
// Read failures fail OPEN (allow the run): the run still logs, so the next
// check self-corrects, and blocking every member action on a transient
// Airtable hiccup is the worse outcome at this scale.

import { listWorkflowRuns } from "@/lib/airtable";
import { isOwner } from "@/lib/auth-shared";

// Weekly caps PER USER. Env overrides win (SCRAPE_/RESEARCH_/DRAFT_CAP_WEEKLY);
// these defaults are deliberately conservative because the APIs bill to the
// OWNER's shared accounts — Apollo's free tier is ~25 enrichments/MONTH total,
// so research defaults low. Raise via env once on a paid plan.
const DEFAULT_CAPS: Record<string, number> = {
  scrape_jobs: 14, // ~2/day; mostly free native boards + bounded Apify fallback
  research: 8, // each ≈ 1-2 Apollo credits; keep well under the shared free tier
  draft_emails: 15, // Anthropic tokens per draft
};

function capFor(workflow: string): number | null {
  const envByWorkflow: Record<string, string | undefined> = {
    scrape_jobs: process.env.SCRAPE_CAP_WEEKLY,
    research: process.env.RESEARCH_CAP_WEEKLY,
    draft_emails: process.env.DRAFT_CAP_WEEKLY,
  };
  const raw = envByWorkflow[workflow];
  if (raw != null && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return workflow in DEFAULT_CAPS ? DEFAULT_CAPS[workflow] : null; // null = unmetered
}

/** Monday 00:00 UTC of the current week, ISO — the rolling quota window start. */
function weekStartISO(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mondayOffset = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  return d.toISOString();
}

export interface QuotaStatus {
  metered: boolean;
  ok: boolean;
  used: number;
  cap: number; // Infinity when unmetered/owner
  remaining: number;
}

/** Has `email` room to run `workflow` this week? Owner + unmetered → always ok. */
export async function quotaStatus(email: string, workflow: string): Promise<QuotaStatus> {
  const cap = capFor(workflow);
  if (isOwner(email) || cap == null) {
    return { metered: false, ok: true, used: 0, cap: Infinity, remaining: Infinity };
  }
  const since = weekStartISO();
  let used = 0;
  try {
    const runs = await listWorkflowRuns(email, 100); // owner-scoped to `email`
    used = runs.filter((r) => r.workflow === workflow && (r.startedAt ?? "") >= since).length;
  } catch (e) {
    console.error("quota: run-count read failed (failing open)", e);
    used = 0;
  }
  return { metered: true, ok: used < cap, used, cap, remaining: Math.max(0, cap - used) };
}
