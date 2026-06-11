// Server-only session helpers — the real per-request enforcement layer
// (PRD §5.2). Middleware is only the coarse wall; every page and member API
// route calls one of these itself (layouts don't re-run on soft navigation).
//
// M2 shape: getViewContext honors the signed `viewas` cookie (admin-only,
// PRD D7/§5.5), and requireUser gains the onboarding redirect. requireUserApi
// never redirects — Account Status enforcement only.

import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "./auth";
import { isOwner, normalizeEmail } from "./auth-shared";
import { getUserRowCached, usersConfigured } from "./users";
import { VIEWAS_COOKIE, verifyViewAsToken } from "./viewas";

// ── Errors ───────────────────────────────────────────────────────────────────

export class AuthError extends Error {
  status: number;
  constructor(status: 401 | 403, message?: string) {
    super(message ?? (status === 403 ? "forbidden" : "unauthorized"));
    this.name = "AuthError";
    this.status = status;
  }
}

/** Route-handler catch helper: AuthError → JSON 401/403; anything else rethrows. */
export function handleAuthError(e: unknown): NextResponse {
  if (e instanceof AuthError) {
    return NextResponse.json(
      { ok: false, error: e.status === 403 ? "forbidden" : "unauthorized" },
      { status: e.status },
    );
  }
  throw e;
}

// ── Internals ────────────────────────────────────────────────────────────────

async function sessionEmail(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email;
  return email ? normalizeEmail(email) : null;
}

// Per-request Account-Status check (PRD D4). When the Users table is
// configured, every variant requires `Account Status === "active"` via a
// 30s-cached read (disable propagates ≤ ~60s). Unconfigured (M0) → skip.
// The owner never depends on table state — a broken/missing row must not
// brick the app. Fail closed for everyone else (lookup error → not active).
async function accountActive(email: string): Promise<boolean> {
  if (!usersConfigured()) return true;
  if (isOwner(email)) return true;
  try {
    const row = await getUserRowCached(email);
    return row?.accountStatus === "active";
  } catch {
    return false; // duplicate rows or lookup anomaly — fail closed
  }
}

// ── Page guards (redirect) ───────────────────────────────────────────────────

/** Pages: require a signed-in, active user.
 *  M0 simplification: redirects to /login without a callbackUrl — middleware
 *  already preserves callbackUrl on its own redirects, and the current path
 *  isn't cleanly knowable server-side.
 *
 *  M2 onboarding gate (PRD §5.2/§7.4): a Users row that exists with
 *  `Onboarding Status !== "complete"` redirects to /onboarding — EXCEPT
 *  (a) under view-as (the admin is viewing a member; never bounce the admin
 *  into the member's wizard) and (b) the owner-with-no-row bootstrap (the
 *  owner is allowed through; the migrate route creates his row). */
export async function requireUser(): Promise<{ email: string }> {
  const email = await sessionEmail();
  if (!email) redirect("/login");
  if (!(await accountActive(email))) redirect("/login?error=account-disabled");

  if (usersConfigured()) {
    const ctx = await getViewContext(); // cached; cannot 401 here — email exists
    if (!ctx.isViewAs) {
      // Members with a duplicate-row anomaly were already failed closed by
      // accountActive(); only the owner can reach this catch — let him through
      // (bootstrap: no row / broken row must never brick the owner).
      const row = await getUserRowCached(email).catch(() => null);
      if (row && row.onboardingStatus !== "complete") redirect("/onboarding");
    }
  }
  return { email };
}

/** Pages: require the owner (PRD D3). Non-admin → home, never a 403 page. */
export async function requireAdmin(): Promise<{ email: string }> {
  const email = await sessionEmail();
  if (!email) redirect("/login");
  if (!isOwner(email)) redirect("/");
  return { email };
}

// ── API guards (throw AuthError — never redirect) ────────────────────────────

export async function requireUserApi(): Promise<{ email: string }> {
  const email = await sessionEmail();
  if (!email) throw new AuthError(401);
  if (!(await accountActive(email))) throw new AuthError(403);
  return { email };
}

export async function requireAdminApi(): Promise<{ email: string }> {
  const email = await sessionEmail();
  if (!email) throw new AuthError(401);
  if (!isOwner(email)) throw new AuthError(403);
  return { email };
}

// ── View context (M2 — real view-as, PRD D7/§5.5) ────────────────────────────

export interface ViewContext {
  sessionEmail: string;
  effectiveEmail: string;
  isAdmin: boolean;
  isViewAs: boolean;
}

/** Resolved once per request (React cache). The `viewas` cookie is honored
 *  ONLY when ALL of:
 *    1. signature + expiry verify (HMAC under AUTH_SECRET — lib/viewas.ts),
 *    2. the session is the admin RIGHT NOW (isOwner is an env compare, so this
 *       is the fresh per-request re-verify D7 requires), and
 *    3. the token's `admin` matches the session email (a minted token is bound
 *       to the admin who minted it).
 *  Any failure → ignored silently: the caller sees their OWN data (a member
 *  presenting a forged/stolen cookie learns nothing). Mutations must NEVER
 *  read effectiveEmail (PRD §4). */
export const getViewContext = cache(async (): Promise<ViewContext> => {
  const email = await sessionEmail();
  if (!email) throw new AuthError(401);
  const isAdmin = isOwner(email);

  if (isAdmin) {
    const payload = verifyViewAsToken(cookies().get(VIEWAS_COOKIE)?.value);
    if (payload && normalizeEmail(payload.admin) === email) {
      const target = normalizeEmail(payload.target);
      if (target && target !== email) {
        return { sessionEmail: email, effectiveEmail: target, isAdmin, isViewAs: true };
      }
    }
  }

  return { sessionEmail: email, effectiveEmail: email, isAdmin, isViewAs: false };
});

/** Top of every mutating route: view-as sessions are read-only by
 *  construction (PRD D7) — 403 `read-only: view-as session`. */
export function assertWritable(ctx: ViewContext): void {
  if (ctx.isViewAs) throw new AuthError(403, "read-only: view-as session");
}

// ── CSRF (PRD D12: SameSite=Lax cookie + origin check + JSON content type) ───

const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

/** For mutating requests: reject when an Origin header is present and its host
 *  differs from the request host, and reject non-JSON bodies. M2 wires this
 *  into every mutating route. */
export function assertSameOrigin(req: Request): void {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) return;

  const origin = req.headers.get("origin");
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AuthError(403, "invalid origin");
    }
    // Vercel terminates TLS at the proxy — x-forwarded-host is the real host.
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
    if (!host || originHost !== host) throw new AuthError(403, "cross-origin request rejected");
  }

  // A non-JSON content type on a mutating request means an HTML-form or
  // no-preflight cross-site post — our clients always send application/json.
  const contentType = req.headers.get("content-type");
  if (contentType && !/^application\/json\b/i.test(contentType.trim())) {
    throw new AuthError(403, "unsupported content type");
  }
}
