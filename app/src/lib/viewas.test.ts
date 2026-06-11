// viewas.test.ts — HMAC view-as token mint/verify vectors (PRD §13A.16, D7/§5.5).
// An invalid/forged/expired/malformed token must verify to null, never throw.

import { describe, it, expect } from "vitest";

// createViewAsToken/verifyViewAsToken read AUTH_SECRET lazily at call time, but
// the reject-cases block mints a token in its describe body (collection phase) —
// set the secret BEFORE importing/using viewas, not in a beforeAll hook.
process.env.AUTH_SECRET = "test-secret-for-viewas-hmac";

import { createViewAsToken, verifyViewAsToken } from "./viewas";

const ADMIN = "admin@example.com";
const TARGET = "member@example.com";

describe("viewas mint → verify round-trip", () => {
  it("verifies a freshly minted token and returns the normalized payload", () => {
    const now = Date.now();
    const token = createViewAsToken(ADMIN, TARGET, now);
    const p = verifyViewAsToken(token, now + 1000);
    expect(p).not.toBeNull();
    expect(p!.admin).toBe(ADMIN);
    expect(p!.target).toBe(TARGET);
    expect(p!.exp).toBe(Math.floor(now / 1000) + 3600);
  });
});

describe("viewas reject cases (all → null, never throw)", () => {
  const baseNow = Date.now();
  const good = createViewAsToken(ADMIN, TARGET, baseNow);
  const [b64, sig] = good.split(".");

  it("rejects a tampered payload (signature no longer matches)", () => {
    // Flip a byte in the payload but keep the original signature.
    const badPayload = Buffer.from(
      JSON.stringify({ admin: "evil@example.com", target: TARGET, exp: Math.floor(baseNow / 1000) + 3600 }),
      "utf8",
    ).toString("base64url");
    expect(verifyViewAsToken(`${badPayload}.${sig}`, baseNow + 1)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(verifyViewAsToken(`${b64}.${flipped}`, baseNow + 1)).toBeNull();
  });

  it("rejects a token with no dot", () => {
    expect(verifyViewAsToken(b64, baseNow + 1)).toBeNull();
  });

  it("rejects a token with two dots", () => {
    expect(verifyViewAsToken(`${b64}.${sig}.extra`, baseNow + 1)).toBeNull();
  });

  it("rejects a truncated signature", () => {
    expect(verifyViewAsToken(`${b64}.${sig.slice(0, 8)}`, baseNow + 1)).toBeNull();
  });

  it("rejects an expired token (exp in the past)", () => {
    const token = createViewAsToken(ADMIN, TARGET, baseNow);
    // Verify 2 hours later — past the 1h max-age.
    expect(verifyViewAsToken(token, baseNow + 2 * 3600 * 1000)).toBeNull();
  });

  it("rejects a non-number exp (string exp)", () => {
    const payload = Buffer.from(
      JSON.stringify({ admin: ADMIN, target: TARGET, exp: "9999999999" }),
      "utf8",
    ).toString("base64url");
    // Re-sign so the signature is valid but the SHAPE is wrong.
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const sig2 = createHmac("sha256", process.env.AUTH_SECRET!).update(payload).digest("base64url");
    expect(verifyViewAsToken(`${payload}.${sig2}`, baseNow + 1)).toBeNull();
  });

  it("rejects a non-JSON payload (validly signed but garbage)", () => {
    const payload = Buffer.from("not json at all", "utf8").toString("base64url");
    const { createHmac } = require("node:crypto") as typeof import("node:crypto");
    const sig2 = createHmac("sha256", process.env.AUTH_SECRET!).update(payload).digest("base64url");
    expect(verifyViewAsToken(`${payload}.${sig2}`, baseNow + 1)).toBeNull();
  });

  it("rejects null / empty input", () => {
    expect(verifyViewAsToken(null, baseNow)).toBeNull();
    expect(verifyViewAsToken(undefined, baseNow)).toBeNull();
    expect(verifyViewAsToken("", baseNow)).toBeNull();
  });
});
