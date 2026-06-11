// GET /api/gmail/callback — finish the per-user Gmail grant (Phase 3b). Verifies
// the signed state against the live session, exchanges the code for a refresh
// token, reads the connected address, and stores the token ENCRYPTED on the
// user's row. Always redirects back to /profile with a status query — never
// returns a token or raw error to the browser.
import { NextRequest, NextResponse } from "next/server";
import { requireUserApi, AuthError } from "@/lib/session";
import { verifyState } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/auth-shared";
import { setGmailConnection } from "@/lib/users";

export const dynamic = "force-dynamic";

function appBase(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `https://${host}`;
}

export async function GET(req: NextRequest) {
  const base = appBase(req);
  const back = (status: string) => NextResponse.redirect(`${base}/profile?gmail=${status}`);

  let session: { email: string };
  try {
    session = await requireUserApi();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.redirect(`${base}/login`);
    throw e;
  }

  const url = new URL(req.url);
  if (url.searchParams.get("error")) return back("denied"); // user declined consent
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // CSRF: state must be our signed, unexpired token AND bound to THIS session.
  const st = verifyState<{ email: string }>(state ?? "");
  if (!code || !st || normalizeEmail(st.email) !== session.email) return back("error");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return back("unconfigured");
  const redirectUri = `${base}/api/gmail/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!tokenRes.ok) {
      console.error("gmail callback: token exchange failed", tokenRes.status);
      return back("error");
    }
    const tj = (await tokenRes.json()) as { refresh_token?: string; access_token?: string };
    // No refresh token = Google didn't issue one (prior grant without re-consent).
    // prompt=consent should prevent this; if it happens, ask them to retry.
    if (!tj.refresh_token) return back("norefresh");

    // Read the connected address (display only) using the fresh access token.
    let gmailEmail = "";
    if (tj.access_token) {
      const profRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${tj.access_token}` },
      });
      if (profRes.ok) gmailEmail = ((await profRes.json()) as { emailAddress?: string }).emailAddress ?? "";
    }

    await setGmailConnection(session.email, { refreshToken: tj.refresh_token, gmailEmail });
    return back("connected");
  } catch (e) {
    console.error("gmail callback: unexpected failure", e);
    return back("error");
  }
}
