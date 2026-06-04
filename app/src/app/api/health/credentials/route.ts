import { NextResponse } from "next/server";
import { checkCredentials } from "@/lib/health";

export const dynamic = "force-dynamic";

// GET /api/health/credentials — one-call health check across every integration.
// Returns 200 when all configured services pass, 207 (multi-status) otherwise.
export async function GET() {
  const checks = await checkCredentials();
  const allOk = checks.every((c) => c.ok);
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 207 });
}
