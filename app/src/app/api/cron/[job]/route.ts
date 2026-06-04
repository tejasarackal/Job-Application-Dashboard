import { NextRequest, NextResponse } from "next/server";
import { driveJob, jobWorkflows } from "@/lib/workflows/drive";

export const dynamic = "force-dynamic";
// Self-driving chunk loop runs up to the wall-clock budget inside one invocation.
export const maxDuration = 60;

// GET /api/cron/{job} — hit by Vercel Cron (see vercel.json). Drives the job's
// workflows to completion within a time budget; idempotent + resumable next run.
// Query (manual testing only): ?dryRun=1, ?budgetMs=NNNNN.
export async function GET(req: NextRequest, { params }: { params: { job: string } }) {
  const job = params.job;
  if (!jobWorkflows(job)) {
    return NextResponse.json({ ok: false, error: `unknown cron job: ${job}` }, { status: 404 });
  }

  // If CRON_SECRET is set in Vercel, require the bearer header Vercel Cron sends —
  // blocks public hits. If unset, the endpoint is open (set CRON_SECRET to secure).
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const budgetMs = Number(url.searchParams.get("budgetMs")) || undefined;

  const result = await driveJob(job, { dryRun, budgetMs });
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
