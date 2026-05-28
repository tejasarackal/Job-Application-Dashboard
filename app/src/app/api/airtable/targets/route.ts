import { NextResponse } from "next/server";
import { isConfigured, listTargets } from "@/lib/airtable";
import { mockTargets } from "@/lib/mock";
import type { ApiResponse, TargetCompany } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json<ApiResponse<TargetCompany[]>>({
      ok: true,
      source: "mock",
      data: mockTargets,
    });
  }
  try {
    const data = await listTargets();
    return NextResponse.json<ApiResponse<TargetCompany[]>>({ ok: true, source: "live", data });
  } catch (e) {
    return NextResponse.json<ApiResponse<TargetCompany[]>>({
      ok: false,
      source: "mock",
      data: mockTargets,
      error: (e as Error).message,
    });
  }
}
