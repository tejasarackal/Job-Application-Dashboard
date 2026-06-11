// drive.ts — self-driving chunk loops for Vercel Cron. A cron fires ONCE and
// gets one function invocation, but our workflows are chunked, so the cron
// endpoint loops executeChunk() until the workflow is done OR a wall-clock budget
// runs out (Hobby caps the function at ~60s). Everything is idempotent + cursor
// resumable, so whatever doesn't finish today resumes on the next run.
import { executeChunk, resolveOwnerEmail, OWNER_EMAIL_UNSET, type ChunkResult } from "./execute";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Hobby = 2 cron jobs, daily only. So the PRD's 4 cadences collapse into 2 jobs:
//   scrape   → the async Apify scrape (its own budget; it's the long pole)
//   pipeline → the chunked Gmail-sync + outreach generation, in priority order
// (On Vercel Pro these could be split into per-workflow crons at any frequency.)
// revalidate_listings runs FIRST in the pipeline (fast, native-only, no Apify/LLM):
// it prunes dead/closed listing links so New never shows a stale posting — a 2nd
// daily expiry pass complementing the scrape cron's own buildExpiries.
// detect_boards runs LAST (resolves/repairs Workday tokens with whatever budget
// remains) so it never starves the outreach workflows; it's idempotent + resumable,
// so a partial sweep finishes over subsequent days.
const JOBS: Record<string, string[]> = {
  scrape: ["scrape_jobs"],
  pipeline: ["revalidate_listings", "sync_applications", "sync_interviews", "research", "draft_emails", "detect_boards"],
};

export function jobWorkflows(job: string): string[] | undefined {
  return JOBS[job];
}

export interface WorkflowDriveSummary {
  workflow: string;
  chunks: number;
  counts: Record<string, number>;
  notes?: string;
  error?: string;
  unfinished?: boolean; // ran out of budget with work remaining
}

export async function driveJob(
  job: string,
  opts: { budgetMs?: number; dryRun?: boolean } = {},
): Promise<{ ok: boolean; job: string; error?: string; summary: WorkflowDriveSummary[] }> {
  const workflows = JOBS[job];
  if (!workflows) return { ok: false, job, error: `unknown cron job: ${job}`, summary: [] };

  // Engine identity is fail-closed (PRD §5.6 / G11): OWNER_EMAIL unset → the
  // cron run fails loudly and does nothing — no ownerless rows ever.
  if (!resolveOwnerEmail()) {
    console.error(`driveJob(${job}): ${OWNER_EMAIL_UNSET}`);
    return { ok: false, job, error: OWNER_EMAIL_UNSET, summary: [] };
  }

  const deadline = Date.now() + (opts.budgetMs ?? 52_000); // leave headroom under maxDuration=60
  const summary: WorkflowDriveSummary[] = [];

  for (const name of workflows) {
    if (Date.now() >= deadline) {
      summary.push({ workflow: name, chunks: 0, counts: {}, unfinished: true });
      continue;
    }
    let cursor: unknown = undefined;
    let more = true;
    let chunks = 0;
    let last: ChunkResult | undefined;
    while (more && Date.now() < deadline && chunks < 100) {
      last = await executeChunk(name, { trigger: "scheduled", dryRun: opts.dryRun, cursor });
      chunks++;
      more = last.more;
      cursor = last.cursor;
      if (last.error) break;
      // scrape_jobs is an async Apify run we poll — pace the polling.
      if (more && name === "scrape_jobs") await sleep(1500);
    }
    summary.push({
      workflow: name,
      chunks,
      counts: last?.counts ?? {},
      notes: last?.notes,
      error: last?.error,
      unfinished: more && !last?.error,
    });
  }

  return { ok: true, job, summary };
}
