// Edge-safe auth primitives shared by middleware, the NextAuth config, and
// server helpers. This module must stay importable from the Edge runtime:
// no Airtable, no Node-only APIs, no env validation at module load.

/** Canonical email form used everywhere: trimmed + lowercased.
 *  Never dot/plus-canonicalized (CR-S11) — `a.b+c@gmail.com` is not `ab@gmail.com`. */
export function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

/** Admin = normalized email === OWNER_EMAIL env (PRD D3 — no Role column).
 *  Lazy env read: unset OWNER_EMAIL just means "nobody is owner". */
export function isOwner(email: string | null | undefined): boolean {
  const owner = process.env.OWNER_EMAIL;
  if (!owner || !email) return false;
  return normalizeEmail(email) === normalizeEmail(owner);
}

// Matches ASCII control characters (C0 + DEL) — built from a string with
// explicit escapes so no literal control byte ever lives in this source file.
const CONTROL_CHARS_RE = new RegExp("[\\u0000-\\u001f\\u007f]");

// callbackUrl values arrive from the browser and are hostile (PRD D12).
// Decode fully first so `%2F%2Fevil.com` can't smuggle past the checks, then
// accept only a same-site relative path. Anything suspicious collapses to "/".
export function validateCallbackUrl(raw: unknown): string {
  if (typeof raw !== "string" || raw === "") return "/";
  let decoded = raw;
  try {
    // Decode until stable (capped) — single-pass decoding misses double-encoding.
    for (let i = 0; i < 5; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return "/"; // malformed percent-encoding
  }
  if (!decoded.startsWith("/")) return "/"; // absolute URLs, schemes, etc.
  if (decoded.startsWith("//")) return "/"; // protocol-relative breakout
  if (decoded.includes("\\")) return "/"; // backslash tricks (browser path-normalization)
  if (CONTROL_CHARS_RE.test(decoded)) return "/"; // control chars (header splitting)
  return decoded;
}
