import { NextResponse } from "next/server";
import { isConfigured, recentThreads } from "@/lib/gmail";
import { mockGmailThreads } from "@/lib/mock";
import type { ApiResponse, GmailThread } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json<ApiResponse<GmailThread[]>>({
      ok: true,
      source: "mock",
      data: mockGmailThreads,
    });
  }
  try {
    const data = await recentThreads(15);
    return NextResponse.json<ApiResponse<GmailThread[]>>({ ok: true, source: "live", data });
  } catch (e) {
    return NextResponse.json<ApiResponse<GmailThread[]>>({
      ok: false,
      source: "mock",
      data: mockGmailThreads,
      error: (e as Error).message,
    });
  }
}
