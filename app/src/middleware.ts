// Edge middleware — the coarse default-deny wall (PRD §4, D12). Checks JWT
// signature/expiry only; the real per-request enforcement (Account Status,
// admin checks) lives in lib/session.ts. Built from the edge-safe split
// config — importing lib/auth.ts here would drag the Airtable Users lookup
// into the edge bundle.

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { validateCallbackUrl } from "@/lib/auth-shared";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (req.auth?.user?.email) return NextResponse.next();

  const { pathname, search } = req.nextUrl;

  // APIs get JSON, never a redirect.
  if (pathname.startsWith("/api")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Pages: preserve the intended destination, validated (hostile input — D12).
  const callbackUrl = validateCallbackUrl(pathname + search);
  const login = new URL("/login", req.nextUrl.origin);
  if (callbackUrl !== "/") login.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(login);
});

// Pinned matcher (guardrail G8 — a test pins this exact content). Exempts
// ONLY: /login, /privacy, /terms, /api/auth/*, /api/cron/*, /api/health/*,
// _next/*, favicon.ico, and static asset files. Everything else is fronted.
export const config = {
  matcher: [
    "/((?!login|privacy|terms|api/auth|api/cron|api/health|_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2)$).*)",
  ],
};
