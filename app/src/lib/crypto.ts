// crypto.ts — AES-256-GCM for secrets at rest (per-user Gmail refresh tokens,
// PRD-multi-user Phase 3b, R6). The key comes from TOKEN_ENC_KEY (a 32-byte
// base64 value set in Vercel only). Ciphertext format is self-describing:
//   v1:<iv b64>:<authTag b64>:<ciphertext b64>
// Decrypt verifies the GCM tag, so tampering throws rather than yielding
// garbage. Lazy key read → safe to import at build time with no env.
//
// These tokens are mailbox credentials: never log them, never return them to a
// client, never store plaintext. Airtable holds only the ciphertext (interim;
// a KV/Neon store is the eventual home — PRD R6).

import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac, timingSafeEqual } from "crypto";

function key(): Buffer {
  const raw = process.env.TOKEN_ENC_KEY;
  if (!raw || !raw.trim()) throw new Error("TOKEN_ENC_KEY not set");
  const b64 = Buffer.from(raw, "base64");
  // Prefer a real 32-byte base64 key; otherwise derive 32 bytes deterministically
  // so a hex/passphrase value still works (never silently weak).
  return b64.length === 32 ? b64 : createHash("sha256").update(raw, "utf8").digest();
}

/** Encrypt a UTF-8 secret → opaque "v1:iv:tag:data" string (all base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** Decrypt a string produced by encryptSecret. Throws on tamper/format/key error. */
export function decryptSecret(blob: string): string {
  const parts = (blob ?? "").split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("bad ciphertext format");
  const [, ivB, tagB, dataB] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB, "base64")), decipher.final()]).toString("utf8");
}

// ── Signed, expiring state token (HMAC, AUTH_SECRET) ──────────────────────────
// Generic tamper-evident state for short-lived round-trips (the Gmail OAuth CSRF
// `state` param). Not encryption — the payload is readable; the signature proves
// we issued it. Format: base64url(JSON{...,exp}) + "." + base64url(HMAC).

function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || !s.trim()) throw new Error("AUTH_SECRET unset — cannot sign state");
  return s;
}

export function signState(payload: Record<string, unknown>, ttlSec = 600): string {
  const body = { ...payload, exp: Date.now() + ttlSec * 1000 };
  const b64 = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const sig = createHmac("sha256", authSecret()).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

/** Verify signature + expiry. Returns the payload, or null — never throws. */
export function verifyState<T = Record<string, unknown>>(token: string): T | null {
  try {
    const [b64, sig] = (token ?? "").split(".");
    if (!b64 || !sig) return null;
    const expected = createHmac("sha256", authSecret()).update(b64).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const body = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as { exp?: number };
    if (typeof body.exp !== "number" || body.exp < Date.now()) return null;
    return body as T;
  } catch {
    return null;
  }
}
