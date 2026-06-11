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
import { detectBoards } from "./detectBoards";
import { revalidateListings } from "./revalidateListings";
import { normalizeEmail, isOwner } from "@/lib/auth-shared";
import { scrapeableTargetKeys } from "@/lib/targets-server";
import type { WorkflowName, WorkflowTrigger } from "@/lib/types";

// Engine identity (PRD §5.6 / G11, fail-closed): the engine acts as the OWNER
// and refuses to run when OWNER_EMAIL is unset — no ownerless rows, ever.
// Every workflow read/write below is threaded this identity.
export function resolveOwnerEmail(): string | null {
  const raw = process.env.OWNER_EMAIL;
  if (!raw || !raw.trim()) return null;
  return normalizeEmail(raw);
}

export const OWNER_EMAIL_UNSET = "OWNER_EMAIL unset — engine refuses to run";

type SyncOpts = {
  ownerEmail: string;
  maxItems?: number;
  dryRun?: boolean;
  cursor?: { offset?: number };
};

// research + draft_emails do ONE item per invocation (~6s each: Apollo / Sonnet);
// the Gmail-sync workers use fast Haiku, so 3 per invocation is fine.
// refresh_scrape_targets is a one-shot dedup/sync (no chunking).
const SYNC_RUNNERS: Record<string, (o: SyncOpts) => Promise<RunResult>> = {
  sync_applications: syncApplications,
  sync_interviews: syncInterviews,
  research: researchLeads,
  draft_emails: draftEmails,
  refresh_scrape_targets: () => refreshScrapeTargets(), // unowned mart sync — no tenant rows
  detect_boards: detectBoards, // unowned Scrape_Targets writes — ownerEmail unused
  revalidate_listings: (o) => revalidateListings({ ownerEmail: o.ownerEmail, dryRun: o.dryRun }),
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
  // The tenant this run acts for (Phase 3). The ROUTE sets this from the
  // authenticated session (members → their own email only); cron/owner leave it
  // unset → falls back to OWNER_EMAIL. Never trust a client-supplied value here.
  actorEmail?: string;
}

// Runs exactly one bounded step of `name` as `actorEmail` (default OWNER_EMAIL).
// scrape_jobs self-manages its run-log row (async multi-source); the others are
// wrapped in withRunLog per chunk. All reads/writes are stamped to the actor.
export async function executeChunk(name: string, opts: ChunkOpts): Promise<ChunkResult> {
  // Actor resolved at entry, fail-closed: a member run passes actorEmail; cron/
  // owner fall back to OWNER_EMAIL. No actor → no work, no ownerless rows.
  const actor = opts.actorEmail ? normalizeEmail(opts.actorEmail) : resolveOwnerEmail();
  if (!actor) {
    console.error(`executeChunk(${name}): ${OWNER_EMAIL_UNSET}`);
    return { ok: false, more: false, counts: {}, error: OWNER_EMAIL_UNSET };
  }

  if (name === "scrape_jobs") {
    // Per-user: scope the mart to the actor's effective targets. The owner
    // (and cron, which runs as owner) scrape the whole mart — null filter,
    // legacy behavior unchanged.
    const targetKeys = isOwner(actor) ? null : await scrapeableTargetKeys(actor);
    // Parallel scrape completes in one invocation (no cursor / chunk loop).
    const r = await scrapeJobs({
      ownerEmail: actor,
      targetKeys,
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
  const outcome = await withRunLog(name as WorkflowName, opts.trigger, actor, () =>
    runner({ ownerEmail: actor, maxItems, dryRun: opts.dryRun, cursor: opts.cursor as { offset?: number } | undefined }),
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
