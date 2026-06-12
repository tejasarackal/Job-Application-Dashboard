// quota.ts — per-user DAILY run caps (PRD-multi-user Phase 3: "owner pays,
// with per-user caps"). No new table: the Workflow_Runs log IS the usage
// ledger. Every member-triggered run writes a row stamped to the actor
// (withRunLog / scrapeJobs' createWorkflowRun), so the cap check just counts
// TODAY's rows for that workflow. The owner is exempt; unmetered workflows
// (no cap configured) are always allowed.
//
// Read failures fail OPEN (allow the run): the run still logs, so the next
// check self-corrects, and blocking every member action on a transient
// Airtable hiccup is the worse outcome at this scale.

import { listWorkflowRuns } from "@/lib/airtable";
import { isOwner } from "@/lib/auth-shared";

// Daily caps PER USER. Env overrides win (SCRAPE_/RESEARCH_/DRAFT_CAP_DAILY).
// NOTE: research bills Apollo (a free tier is ~25 enrichments/MONTH) — at 15/day
// that tier is exhausted fast, so lower RESEARCH_CAP_DAILY via env if you're not
// on a paid Apollo plan.
const DEFAULT_CAPS: Record<string, number> = {
  scrape_jobs: 15, // mostly free native boards + a bounded Apify fallback
  research: 15, // ⚠ each ≈ 1-2 Apollo credits — see note above
  draft_emails: 15, // Anthropic tokens per draft
};

function capFor(workflow: string): number | null {
  const envByWorkflow: Record<string, string | undefined> = {
    scrape_jobs: process.env.SCRAPE_CAP_DAILY,
    research: process.env.RESEARCH_CAP_DAILY,
    draft_emails: process.env.DRAFT_CAP_DAILY,
  };
  const raw = envByWorkflow[workflow];
  if (raw != null && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return workflow in DEFAULT_CAPS ? DEFAULT_CAPS[workflow] : null; // null = unmetered
}

/** Today 00:00 UTC, ISO — the rolling daily quota window start. */
function dayStartISO(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export interface QuotaStatus {
  metered: boolean;
  ok: boolean;
  used: number;
  cap: number; // Infinity when unmetered/owner
  remaining: number;
}

/** Has `email` room to run `workflow` today? Owner + unmetered → always ok. */
export async function quotaStatus(email: string, workflow: string): Promise<QuotaStatus> {
  const cap = capFor(workflow);
  if (isOwner(email) || cap == null) {
    return { metered: false, ok: true, used: 0, cap: Infinity, remaining: Infinity };
  }
  const since = dayStartISO();
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
