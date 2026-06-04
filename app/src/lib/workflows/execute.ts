// execute.ts — one place that knows how to run a single bounded "chunk" of any
// workflow. Shared by the manual route (POST /api/workflows/[name]) and the
// Vercel Cron driver (lib/workflows/drive.ts) so dispatch logic lives once.
import { withRunLog, type RunResult } from "./runLog";
import { scrapeJobs } from "./scrapeJobs";
import { syncApplications } from "./syncApplications";
import { syncInterviews } from "./syncInterviews";
import { researchLeads } from "./researchLeads";
import { draftEmails } from "./draftEmails";
import { refreshScrapeTargets } from "./refreshScrapeTargets";
import type { WorkflowName, WorkflowTrigger } from "@/lib/types";

type SyncOpts = { maxItems?: number; dryRun?: boolean; cursor?: { offset?: number } };

// research + draft_emails do ONE item per invocation (~6s each: Apollo / Sonnet);
// the Gmail-sync workers use fast Haiku, so 3 per invocation is fine.
// refresh_scrape_targets is a one-shot dedup/sync (no chunking).
const SYNC_RUNNERS: Record<string, (o: SyncOpts) => Promise<RunResult>> = {
  sync_applications: syncApplications,
  sync_interviews: syncInterviews,
  research: researchLeads,
  draft_emails: draftEmails,
  refresh_scrape_targets: () => refreshScrapeTargets(),
};

export function isKnownWorkflow(name: string): boolean {
  return name === "scrape_jobs" || name in SYNC_RUNNERS;
}

export interface ChunkResult {
  ok: boolean;
  more: boolean;
  cursor?: unknown;
  counts: Record<string, number>;
  notes?: string;
  error?: string;
  runId?: string;
}

export interface ChunkOpts {
  trigger: WorkflowTrigger;
  dryRun?: boolean;
  windowDays?: number;
  maxItems?: number;
  cursor?: unknown;
}

// Runs exactly one bounded step of `name`. scrape_jobs self-manages its run-log
// row (async multi-source); the others are wrapped in withRunLog per chunk.
export async function executeChunk(name: string, opts: ChunkOpts): Promise<ChunkResult> {
  if (name === "scrape_jobs") {
    // Parallel scrape completes in one invocation (no cursor / chunk loop).
    const r = await scrapeJobs({
      dryRun: opts.dryRun,
      windowDays: opts.windowDays,
      trigger: opts.trigger,
    });
    return { ok: true, more: false, counts: r.counts, notes: r.notes };
  }

  const runner = SYNC_RUNNERS[name];
  if (!runner) {
    return { ok: false, more: false, counts: {}, error: `unknown or not-yet-implemented workflow: ${name}` };
  }

  const slow = name === "draft_emails" || name === "research";
  const maxItems = Math.min(Math.max(opts.maxItems ?? (slow ? 1 : 3), 1), 5);
  const outcome = await withRunLog(name as WorkflowName, opts.trigger, () =>
    runner({ maxItems, dryRun: opts.dryRun, cursor: opts.cursor as { offset?: number } | undefined }),
  );
  return {
    ok: !outcome.error,
    more: Boolean(outcome.result?.partial),
    cursor: outcome.result?.cursor,
    counts: outcome.result?.counts ?? {},
    notes: outcome.result?.notes,
    error: outcome.error,
    runId: outcome.runId,
  };
}
