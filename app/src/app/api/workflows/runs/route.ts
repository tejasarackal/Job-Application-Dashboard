import { NextResponse } from "next/server";
import { isConfigured, listWorkflowRuns } from "@/lib/airtable";
import type { ApiResponse, WorkflowRun } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/workflows/runs — run history + live status for the /workflows console.
export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json<ApiResponse<WorkflowRun[]>>({
      ok: true,
      source: "mock",
      data: [],
    });
  }
  try {
    const data = await listWorkflowRuns();
    return NextResponse.json<ApiResponse<WorkflowRun[]>>({ ok: true, source: "live", data });
  } catch (e) {
    return NextResponse.json<ApiResponse<WorkflowRun[]>>({
      ok: false,
      source: "mock",
      data: [],
      error: (e as Error).message,
    });
  }
}
