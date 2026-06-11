// GET /api/gmail/connect — start the per-user Gmail OAuth grant (Phase 3b).
// Redirects the signed-in user to Google's consent screen for `gmail.modify`
// (offline + prompt=consent so we always receive a refresh token). The `state`
// is HMAC-signed and bound to the session email; the callback re-verifies it and
// the live session before storing anything. Uses the ENGINE OAuth client
// (GOOGLE_CLIENT_ID) — the one with /api/gmail/callback registered.
import { NextRequest, NextResponse } from "next/server";
import { requireUserApi, AuthError } from "@/lib/session";
import { signState } from "@/lib/crypto";

export const dynamic = "force-dynamic";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

function appBase(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `https://${host}`;
}

export async function GET(req: NextRequest) {
  let session: { email: string };
  try {
    session = await requireUserApi();
  } catch (e) {
    // Browser navigation: send unauthenticated users to login, not a JSON 401.
    if (e instanceof AuthError) return NextResponse.redirect(`${appBase(req)}/login`);
    throw e;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(`${appBase(req)}/profile?gmail=unconfigured`);
  }

  const redirectUri = `${appBase(req)}/api/gmail/callback`;
  const state = signState({ email: session.email });
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", clientId);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", GMAIL_SCOPE);
  auth.searchParams.set("access_type", "offline");
  auth.searchParams.set("prompt", "consent"); // force a refresh_token every time
  auth.searchParams.set("include_granted_scopes", "true");
  auth.searchParams.set("state", state);
  auth.searchParams.set("login_hint", session.email); // nudge the right account
  return NextResponse.redirect(auth.toString());
}
