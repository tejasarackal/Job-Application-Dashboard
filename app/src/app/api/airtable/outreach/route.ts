import { NextResponse } from "next/server";
import { isConfigured, listLeads } from "@/lib/airtable";
import { mockOutreach } from "@/lib/mock";
import type { ApiResponse, OutreachContact } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json<ApiResponse<OutreachContact[]>>({
      ok: true,
      source: "mock",
      data: mockOutreach,
    });
  }
  try {
    const data = await listLeads();
    return NextResponse.json<ApiResponse<OutreachContact[]>>({ ok: true, source: "live", data });
  } catch (e) {
    return NextResponse.json<ApiResponse<OutreachContact[]>>({
      ok: false,
      source: "mock",
      data: mockOutreach,
      error: (e as Error).message,
    });
  }
}
