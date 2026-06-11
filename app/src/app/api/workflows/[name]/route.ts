import { NextRequest, NextResponse } from "next/server";
import { describeInputs } from "@/lib/workflows/scrapeJobs";
import { executeChunk } from "@/lib/workflows/execute";
import {
  requireAdminApi,
  assertSameOrigin,
  getViewContext,
  assertWritable,
  handleAuthError,
  AuthError,
} from "@/lib/session";
import type { WorkflowTrigger } from "@/lib/types";

export const dynamic = "force-dynamic";
// Hobby caps function duration (~60s). Each call does one bounded step and
// returns; the client re-invokes with `cursor` until `more` is false.
export const maxDuration = 60;

interface Body {
  trigger?: string;
  maxItems?: number;
  dryRun?: boolean;
  windowDays?: number;
  cursor?: unknown;
  check?: boolean;
}

// POST /api/workflows/{name} — trigger one bounded step.
// Gate (PRD §5.3): admin-only + same-origin; the engine executes as OWNER_EMAIL.
// Body (optional): { trigger, maxItems, dryRun, windowDays, cursor, check }.
export async function POST(req: NextRequest, { params }: { params: { name: string } }) {
  try {
    await requireAdminApi();
    assertSameOrigin(req);
    assertWritable(await getViewContext()); // engine runs never start under view-as (D7)
  } catch (e) {
    if (e instanceof AuthError) return handleAuthError(e);
    throw e;
  }

  const name = params.name;
  const body = (await req.json().catch(() => ({}))) as Body;
  const trigger: WorkflowTrigger = body.trigger === "scheduled" ? "scheduled" : "manual";

  // scrape_jobs diagnostic: report env-input validity without running the actors.
  if (name === "scrape_jobs" && body.check) {
    return NextResponse.json({ ok: true, inputs: await describeInputs() });
  }

  const r = await executeChunk(name, {
    trigger,
    dryRun: body.dryRun,
    windowDays: body.windowDays,
    maxItems: body.maxItems,
    cursor: body.cursor,
  });

  const status = r.error ? (r.error.startsWith("unknown") ? 404 : 500) : 200;
  return NextResponse.json(
    { ok: r.ok, runId: r.runId, counts: r.counts, notes: r.notes, error: r.error, more: r.more, cursor: r.cursor },
    { status },
  );
}
