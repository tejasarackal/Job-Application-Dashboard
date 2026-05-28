import { NextResponse } from "next/server";
import {
  isConfigured,
  listApplications,
  listJobListings,
  listLeads,
  listTargets,
  summarize,
} from "@/lib/airtable";
import { mockSummary } from "@/lib/mock";
import type { ApiResponse, PipelineSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json<ApiResponse<PipelineSummary>>({
      ok: true,
      source: "mock",
      data: mockSummary,
    });
  }
  try {
    // All four reads in parallel — the bottleneck would be sequential calls.
    const [targets, listings, outreach, applications] = await Promise.all([
      listTargets(),
      listJobListings(),
      listLeads(),
      listApplications(),
    ]);
    return NextResponse.json<ApiResponse<PipelineSummary>>({
      ok: true,
      source: "live",
      data: summarize(targets, listings, outreach, applications),
    });
  } catch (e) {
    return NextResponse.json<ApiResponse<PipelineSummary>>({
      ok: false,
      source: "mock",
      data: mockSummary,
      error: (e as Error).message,
    });
  }
}
