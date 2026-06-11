import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { driveJob, jobWorkflows } from "@/lib/workflows/drive";

export const dynamic = "force-dynamic";
// Self-driving chunk loop runs up to the wall-clock budget inside one invocation.
export const maxDuration = 60;

// GET /api/cron/{job} — hit by Vercel Cron (see vercel.json). Drives the job's
// workflows to completion within a time budget; idempotent + resumable next run.
// Query (manual testing only): ?dryRun=1, ?budgetMs=NNNNN.
export async function GET(req: NextRequest, { params }: { params: { job: string } }) {
  // CRON_SECRET is mandatory (fail-closed): unset → 503, so the endpoint is never
  // open to public hits. Vercel Cron sends it as the bearer header; compare
  // timing-safe to avoid leaking the secret byte-by-byte. Auth runs before the
  // job lookup so unauthenticated callers can't enumerate job names.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "cron secret not configured" }, { status: 503 });
  }
  const presented = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const job = params.job;
  if (!jobWorkflows(job)) {
    return NextResponse.json({ ok: false, error: `unknown cron job: ${job}` }, { status: 404 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const budgetMs = Number(url.searchParams.get("budgetMs")) || undefined;

  const result = await driveJob(job, { dryRun, budgetMs });
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
