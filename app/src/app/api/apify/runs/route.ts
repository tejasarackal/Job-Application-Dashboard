import { NextResponse } from "next/server";
import { isConfigured, recentRuns } from "@/lib/apify";
import { mockApifyRuns } from "@/lib/mock";
import type { ApiResponse, ApifyRun } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json<ApiResponse<ApifyRun[]>>({
      ok: true,
      source: "mock",
      data: mockApifyRuns,
    });
  }
  try {
    const data = await recentRuns(8);
    return NextResponse.json<ApiResponse<ApifyRun[]>>({ ok: true, source: "live", data });
  } catch (e) {
    return NextResponse.json<ApiResponse<ApifyRun[]>>({
      ok: false,
      source: "mock",
      data: mockApifyRuns,
      error: (e as Error).message,
    });
  }
}
