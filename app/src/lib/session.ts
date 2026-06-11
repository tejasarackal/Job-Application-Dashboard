// Server-only session helpers — the real per-request enforcement layer
// (PRD §5.2). Middleware is only the coarse wall; every page and member API
// route calls one of these itself (layouts don't re-run on soft navigation).
//
// M0 shape: the Users table is unconfigured, so the Account-Status check is a
// no-op (owner-only world) — M1 flips it on by configuring lib/users.ts, no
// code change here. getViewContext/assertWritable/assertSameOrigin are
// exported now so M2 routes can adopt them without touching this file.

import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "./auth";
import { isOwner, normalizeEmail } from "./auth-shared";
import { getUserRowCached, usersConfigured } from "./users";

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
 *  isn't cleanly knowable server-side. */
export async function requireUser(): Promise<{ email: string }> {
  const email = await sessionEmail();
  if (!email) redirect("/login");
  if (!(await accountActive(email))) redirect("/login?error=account-disabled");
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

// ── View context (M0 minimal — view-as cookie logic lands in M2) ─────────────

export interface ViewContext {
  sessionEmail: string;
  effectiveEmail: string;
  isAdmin: boolean;
  isViewAs: boolean;
}

/** Resolved once per request (React cache). In M0 there is no view-as cookie,
 *  so effectiveEmail always equals sessionEmail. Mutations must NEVER read
 *  effectiveEmail (PRD §4). */
export const getViewContext = cache(async (): Promise<ViewContext> => {
  const email = await sessionEmail();
  if (!email) throw new AuthError(401);
  return {
    sessionEmail: email,
    effectiveEmail: email,
    isAdmin: isOwner(email),
    isViewAs: false,
  };
});

/** Top of every mutating route (M2 wires it in): view-as sessions are
 *  read-only by construction (PRD D7). Inert in M0 — isViewAs is always false. */
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
