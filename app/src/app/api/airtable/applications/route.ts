import { NextResponse } from "next/server";
import { isConfigured, listApplications } from "@/lib/airtable";
import { mockApplications } from "@/lib/mock";
import type { ApiResponse, Application } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json<ApiResponse<Application[]>>({
      ok: true,
      source: "mock",
      data: mockApplications,
    });
  }
  try {
    const data = await listApplications();
    return NextResponse.json<ApiResponse<Application[]>>({ ok: true, source: "live", data });
  } catch (e) {
    return NextResponse.json<ApiResponse<Application[]>>({
      ok: false,
      source: "mock",
      data: mockApplications,
      error: (e as Error).message,
    });
  }
}
