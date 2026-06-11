// viewas.ts — compact HMAC token for the admin view-as cookie (PRD D7/§5.5).
//
// Format: base64url(JSON payload) + "." + base64url(HMAC_SHA256(AUTH_SECRET, b64payload))
// Payload: { admin: string, target: string, exp: epochSeconds }.
// Verify = recompute signature + timingSafeEqual + exp check. Max age 1h.
//
// Node runtime only (node:crypto) — never import from middleware/Edge.

import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "./auth-shared";

export const VIEWAS_COOKIE = "viewas";
export const VIEWAS_MAX_AGE_S = 3600; // PRD D7: exp ≤ 1h

export interface ViewAsPayload {
  admin: string; // normalized admin (session) email that minted the token
  target: string; // normalized member email being viewed
  exp: number; // epoch SECONDS
}

function hmacKey(): string {
  // Lazy read — AUTH_SECRET is enforced at sign time, never at module load.
  return process.env.AUTH_SECRET ?? "";
}

function sign(b64payload: string, key: string): string {
  return createHmac("sha256", key).update(b64payload).digest("base64url");
}

/** Mint a view-as token. Throws when AUTH_SECRET is unset — entering view-as
 *  without a signing secret must be impossible, not silently unsigned. */
export function createViewAsToken(
  adminEmail: string,
  targetEmail: string,
  nowMs: number = Date.now(),
): string {
  const key = hmacKey();
  if (!key) throw new Error("viewas: AUTH_SECRET unset — cannot sign token");
  const payload: ViewAsPayload = {
    admin: normalizeEmail(adminEmail),
    target: normalizeEmail(targetEmail),
    exp: Math.floor(nowMs / 1000) + VIEWAS_MAX_AGE_S,
  };
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${b64}.${sign(b64, key)}`;
}

/** Verify signature + shape + expiry. Returns the payload or null — NEVER
 *  throws: an invalid/forged/expired cookie is silently ignored (the caller
 *  falls back to the session's own identity, PRD §5.5). */
export function verifyViewAsToken(
  token: string | null | undefined,
  nowMs: number = Date.now(),
): ViewAsPayload | null {
  const key = hmacKey();
  if (!key || !token) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || token.indexOf(".", dot + 1) !== -1) return null;
  const b64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  // Constant-time signature compare (recompute, then timingSafeEqual).
  const expected = Buffer.from(sign(b64, key));
  const presented = Buffer.from(sig);
  if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.admin !== "string" || typeof p.target !== "string") return null;
  if (typeof p.exp !== "number" || !Number.isFinite(p.exp)) return null;
  if (p.exp * 1000 <= nowMs) return null; // expired

  return { admin: p.admin, target: p.target, exp: p.exp };
}
