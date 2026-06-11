// POST /api/gmail/disconnect — clear the caller's stored Gmail connection
// (Phase 3b). Origin-checked; never runs under view-as (an admin must not
// disconnect a member's Gmail). Acts only on the session user's own row.
import { NextRequest, NextResponse } from "next/server";
import {
  requireUserApi,
  assertSameOrigin,
  assertWritable,
  getViewContext,
  handleAuthError,
  AuthError,
} from "@/lib/session";
import { clearGmailConnection } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireUserApi();
    assertSameOrigin(req);
    assertWritable(await getViewContext());
    await clearGmailConnection(session.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return handleAuthError(e);
    console.error("gmail disconnect failed", e);
    return NextResponse.json({ ok: false, error: "Couldn’t disconnect — try again." }, { status: 500 });
  }
}
