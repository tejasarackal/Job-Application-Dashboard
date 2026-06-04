// runLog.ts — run-lifecycle wrapper for dashboard-triggered workflows.
// Every workflow executes inside withRunLog(): it opens a `running` row in the
// Airtable Workflow_Runs table, runs the work, then marks success/partial/failed
// with counts + notes. A thrown error is logged as `failed` and surfaced to the
// caller — a workflow never fails silently. See docs/plan/PRD-workflow-engine.md.
import { createWorkflowRun, updateWorkflowRun } from "@/lib/airtable";
import type { WorkflowName, WorkflowTrigger } from "@/lib/types";

export interface RunResult {
  counts: Record<string, number>;
  notes?: string;
  partial?: boolean; // true when there's more work — the client re-invokes with `cursor`
  cursor?: unknown; // opaque continuation token (offset for Gmail sync; source/run state for scrape)
}

export interface RunOutcome {
  runId: string;
  result?: RunResult;
  error?: string;
}

export async function withRunLog(
  workflow: WorkflowName,
  trigger: WorkflowTrigger,
  fn: (ctx: { runId: string }) => Promise<RunResult>,
): Promise<RunOutcome> {
  let runId = "";
  try {
    runId = await createWorkflowRun({ workflow, trigger });
  } catch (e) {
    // Couldn't even open the run row — surface immediately, nothing to clean up.
    return { runId: "", error: `run-log create failed: ${(e as Error).message}` };
  }

  try {
    const result = await fn({ runId });
    await updateWorkflowRun(runId, {
      status: result.partial ? "partial" : "success",
      counts: result.counts,
      notes: result.notes,
      finished: true,
    });
    return { runId, result };
  } catch (e) {
    const error = (e as Error).message || String(e);
    // Best-effort: record the failure, but don't mask the original error.
    await updateWorkflowRun(runId, {
      status: "failed",
      notes: error,
      finished: true,
    }).catch(() => {});
    return { runId, error };
  }
}
