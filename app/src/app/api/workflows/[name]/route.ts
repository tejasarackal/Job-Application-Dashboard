import { NextRequest, NextResponse } from "next/server";
import { describeInputs } from "@/lib/workflows/scrapeJobs";
import { executeChunk, GMAIL_NOT_CONNECTED, GMAIL_AUTH_FAILED } from "@/lib/workflows/execute";
import {
  requireUserApi,
  assertSameOrigin,
  getViewContext,
  assertWritable,
  handleAuthError,
  AuthError,
} from "@/lib/session";
import { quotaStatus } from "@/lib/quota";
import type { WorkflowTrigger } from "@/lib/types";

export const dynamic = "force-dynamic";
// Hobby caps function duration (~60s). Each call does one bounded step and
// returns; the client re-invokes with `cursor` until `more` is false.
export const maxDuration = 60;

// Workflows a non-admin member may run for THEMSELVES. scrape_jobs + research
// (Phase 3a) use shared Apify/Apollo (quota-capped). sync_applications +
// sync_interviews + draft_emails (Phase 3b) operate on the MEMBER's own data;
// the two syncs require a per-user Gmail connection (executeChunk refuses
// otherwise → 409), and draft_emails only writes draft_pending on the member's
// own leads (the Gmail draft itself is created later, in the member's mailbox,
// at the /api/review/draft human gate). The mart/global ops stay admin-only.
const MEMBER_ALLOWED = new Set(["scrape_jobs", "research", "sync_applications", "sync_interviews", "draft_emails"]);

interface Body {
  trigger?: string;
  maxItems?: number;
  dryRun?: boolean;
  windowDays?: number;
  cursor?: unknown;
  check?: boolean;
}

// POST /api/workflows/{name} — trigger one bounded step.
// Gate (PRD §5.3 + Phase 3): signed-in + same-origin + not under view-as. Admins
// may run anything as OWNER_EMAIL; members may run only MEMBER_ALLOWED workflows
// and only AS THEMSELVES (actor = session email, never client-supplied).
export async function POST(req: NextRequest, { params }: { params: { name: string } }) {
  let session: { email: string };
  let isAdmin: boolean;
  try {
    session = await requireUserApi();
    assertSameOrigin(req);
    const ctx = await getViewContext();
    assertWritable(ctx); // engine runs never start under view-as (D7)
    isAdmin = ctx.isAdmin;
  } catch (e) {
    if (e instanceof AuthError) return handleAuthError(e);
    throw e;
  }

  const name = params.name;
  if (!isAdmin && !MEMBER_ALLOWED.has(name)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const trigger: WorkflowTrigger = body.trigger === "scheduled" ? "scheduled" : "manual";

  // scrape_jobs diagnostic: report env-input validity without running the actors.
  if (name === "scrape_jobs" && body.check) {
    return NextResponse.json({ ok: true, inputs: await describeInputs() });
  }

  // Per-user weekly cap (members only; owner/unmetered → ok). Checked before the
  // run so a member can't exceed their Apify/Apollo/Anthropic budget.
  const quota = await quotaStatus(session.email, name);
  if (!quota.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `Weekly limit reached for this action (${quota.used}/${quota.cap}). It resets Monday.`,
        quota,
      },
      { status: 429 },
    );
  }

  const r = await executeChunk(name, {
    trigger: isAdmin ? trigger : "manual", // members can't schedule
    dryRun: isAdmin ? body.dryRun : false, // members always run for real
    windowDays: body.windowDays,
    maxItems: body.maxItems,
    cursor: body.cursor,
    actorEmail: session.email, // owner's email === OWNER_EMAIL; members run as self
  });

  // Map the Gmail-connection errors to a 409 with member-friendly copy.
  if (r.error === GMAIL_NOT_CONNECTED) {
    return NextResponse.json(
      { ok: false, error: "Connect your Gmail first — open Profile → Connect Gmail, then try again.", code: GMAIL_NOT_CONNECTED },
      { status: 409 },
    );
  }
  if (r.error === GMAIL_AUTH_FAILED) {
    return NextResponse.json(
      { ok: false, error: "Your Gmail connection needs renewing — reconnect it in Profile, then try again.", code: GMAIL_AUTH_FAILED },
      { status: 409 },
    );
  }

  const status = r.error ? (r.error.startsWith("unknown") ? 404 : 500) : 200;
  return NextResponse.json(
    { ok: r.ok, runId: r.runId, counts: r.counts, notes: r.notes, error: r.error, more: r.more, cursor: r.cursor },
    { status },
  );
}
