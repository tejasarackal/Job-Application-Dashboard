import { NextResponse } from "next/server";
import { isConfigured, listJobListings } from "@/lib/airtable";
import { mockListings } from "@/lib/mock";
import type { ApiResponse, JobListing } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json<ApiResponse<JobListing[]>>({
      ok: true,
      source: "mock",
      data: mockListings,
    });
  }
  try {
    const data = await listJobListings();
    return NextResponse.json<ApiResponse<JobListing[]>>({
      ok: true,
      source: "live",
      data,
    });
  } catch (e) {
    return NextResponse.json<ApiResponse<JobListing[]>>({
      ok: false,
      source: "mock",
      data: mockListings,
      error: (e as Error).message,
    });
  }
}
