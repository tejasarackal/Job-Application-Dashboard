import { NextResponse } from "next/server";
import { isConfigured, listSequences } from "@/lib/apollo";
import { mockApolloSequences } from "@/lib/mock";
import type { ApiResponse, ApolloSequence } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json<ApiResponse<ApolloSequence[]>>({
      ok: true,
      source: "mock",
      data: mockApolloSequences,
    });
  }
  try {
    const data = await listSequences();
    return NextResponse.json<ApiResponse<ApolloSequence[]>>({ ok: true, source: "live", data });
  } catch (e) {
    return NextResponse.json<ApiResponse<ApolloSequence[]>>({
      ok: false,
      source: "mock",
      data: mockApolloSequences,
      error: (e as Error).message,
    });
  }
}
