import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { shouldAdvance } from "./syncApplications";

// ── Monotonic application status (never regress a later state) ─────────────────
describe("shouldAdvance (monotonic status)", () => {
  it("advances forward and from empty", () => {
    expect(shouldAdvance(undefined, "submitted")).toBe(true);
    expect(shouldAdvance("submitted", "interviewing")).toBe(true);
    expect(shouldAdvance("interviewing", "offered")).toBe(true);
  });
  it("never regresses to an earlier state", () => {
    expect(shouldAdvance("offered", "submitted")).toBe(false);
    expect(shouldAdvance("interviewing", "submitted")).toBe(false);
    expect(shouldAdvance("offered", "interviewing")).toBe(false);
  });
  it("does not rewrite the same status", () => {
    expect(shouldAdvance("interviewing", "interviewing")).toBe(false);
  });
});

// ── Source-level guardrails (enforced in code, per PRD §9) ─────────────────────
const SRC = path.resolve(process.cwd(), "src");

function allSource(dir: string): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...allSource(full));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) {
      out.push({ file: full, text: readFileSync(full, "utf8") });
    }
  }
  return out;
}

describe("guardrails", () => {
  const files = allSource(SRC);

  it("never imports/uses a Gmail send endpoint (draft-only, forever)", () => {
    const offenders = files.filter((f) => /messages\/send|drafts\/send|users\.messages\.send/i.test(f.text));
    expect(offenders.map((o) => o.file)).toEqual([]);
  });

  // Only count real Lead-status WRITES (FIELDS.leads.status]: "draft"), not mock
  // fixtures or label literals.
  const PROMOTE = /FIELDS\.leads\.status\]:\s*"draft"/;

  it("promotes a lead to 'draft' ONLY in the review/draft route, never in generation", () => {
    const promotes = files.filter((f) => PROMOTE.test(f.text)).map((f) => f.file.replace(/\\/g, "/"));
    expect(promotes).toHaveLength(1);
    expect(promotes[0]).toMatch(/app\/api\/review\/draft\/route\.ts$/);
  });

  it("email drafting only ever sets draft_pending (awaits review)", () => {
    const draftGen = files.find((f) => f.file.replace(/\\/g, "/").endsWith("workflows/draftEmails.ts"));
    expect(draftGen).toBeTruthy();
    expect(draftGen!.text).toMatch(/"draft_pending"/);
    expect(draftGen!.text).not.toMatch(PROMOTE); // never the promoted state
  });
});

// ── M0 multi-user guardrails (PRD §9 M0 subset: G6/G8/G11/D12/D13) ────────────
describe("M0 multi-user guardrails", () => {
  const srcFile = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

  // Collect every route.ts under a directory (empty when the dir is absent).
  function routeFiles(rel: string): string[] {
    const dir = path.join(SRC, rel);
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) out.push(...routeFiles(path.relative(SRC, full)));
      else if (name === "route.ts") out.push(full);
    }
    return out;
  }

  // G8 — middleware fronts everything: pinned matcher exempts ONLY the canonical
  // set; no app page or member API is ever exempted.
  it("middleware exists and its pinned matcher exempts only the canonical set", () => {
    const mwPath = path.join(SRC, "middleware.ts");
    expect(existsSync(mwPath)).toBe(true);
    const text = readFileSync(mwPath, "utf8");
    const matcher = text.match(/matcher:\s*\[([\s\S]*?)\]/);
    expect(matcher, "config.matcher literal not found in middleware.ts").toBeTruthy();
    const literal = matcher![1];
    for (const exempt of [
      "login",
      "privacy",
      "terms",
      "api/auth",
      "api/cron",
      "api/health",
      "_next",
      "favicon.ico",
    ]) {
      expect(literal, `matcher must exempt ${exempt}`).toContain(exempt);
    }
    for (const fronted of [
      "listings",
      "applications",
      "interviews",
      "outreach",
      "targets",
      "workflows",
      "admin",
      "profile",
      "review",
    ]) {
      expect(literal, `matcher must NOT exempt ${fronted}`).not.toContain(fronted);
    }
  });

  // D12/R10 — the legacy unauthenticated GET routes were deleted in M0 and must
  // never come back (G6 hardens this further in M2).
  it("legacy open routes stay dead", () => {
    expect(routeFiles("app/api/airtable")).toEqual([]);
    for (const rel of [
      "app/api/gmail/threads/route.ts",
      "app/api/apify/runs/route.ts",
      "app/api/apollo/sequences/route.ts",
      "app/api/workflows/runs/route.ts",
    ]) {
      expect(existsSync(path.join(SRC, rel)), `${rel} must not exist`).toBe(false);
    }
  });

  // G11 (cron half) — CRON_SECRET is mandatory fail-closed: unset → 503,
  // presented bearer compared timing-safe, and no open-when-unset escape.
  it("cron route is fail-closed: 503 on unset secret, timing-safe compare, auth before work", () => {
    const text = srcFile("app/api/cron/[job]/route.ts");
    // 503-on-unset branch exists…
    expect(text).toMatch(/if\s*\(!secret\)\s*\{[\s\S]*?status:\s*503/);
    // …with timing-safe bearer comparison.
    expect(text).toMatch(/timingSafeEqual/);
    // The old open-when-unset escape is gone (no comment or branch declaring the
    // endpoint open, no early success-return inside the unset-secret branch).
    expect(text).not.toMatch(/endpoint is open|open when unset|skip(ping)? auth/i);
    expect(text).not.toMatch(/if\s*\(!secret\)\s*\{[\s\S]{0,200}?ok:\s*true/);
    // No code path reaches the job without a configured secret: both auth checks
    // appear strictly before the job is driven.
    const drive = text.indexOf("driveJob(");
    expect(drive).toBeGreaterThan(-1);
    expect(text.indexOf("503")).toBeLessThan(drive);
    expect(text.indexOf("timingSafeEqual")).toBeLessThan(drive);
  });

  // D13 — health split: public shape is booleans only; detail is gated behind
  // Bearer CRON_SECRET or an admin session.
  it("health endpoint: public shaper leaks nothing; detail gated behind CRON_SECRET/requireAdminApi", () => {
    const lib = srcFile("lib/health.ts");
    // Separate public/detail shapers must exist.
    expect(lib).toMatch(/export function shapePublicHealth\(/);
    expect(lib).toMatch(/export function shapeDetailHealth\(/);
    // The public shaper body must never reference detail fields or the Gmail
    // identity. Extract from its declaration to the next top-level brace.
    const pub = lib.match(/export function shapePublicHealth\([\s\S]*?\n\}/);
    expect(pub, "shapePublicHealth body not extractable").toBeTruthy();
    expect(pub![0]).not.toMatch(/detail/);
    expect(pub![0]).not.toMatch(/emailAddress/);
    // The route gates ?detail=1 behind the two trusted principals.
    const route = srcFile("app/api/health/credentials/route.ts");
    expect(route).toMatch(/CRON_SECRET/);
    expect(route).toMatch(/timingSafeEqual/);
    expect(route).toMatch(/requireAdminApi/);
    expect(route).toMatch(/no-store/);
    // Public path uses only the boolean shaper; detail only the gated shaper.
    expect(route).toMatch(/shapePublicHealth/);
    expect(route).toMatch(/shapeDetailHealth/);
  });

  // D12/§5.1 — auth boundary: strict email_verified check at sign-in; hostile
  // callbackUrl collapsed by the three-condition validation.
  it("auth boundary: email_verified strict check + three-condition callbackUrl validation", () => {
    const auth = srcFile("lib/auth.ts");
    expect(auth).toMatch(/email_verified\s*!==\s*true/);
    const shared = srcFile("lib/auth-shared.ts");
    expect(shared).toContain('startsWith("/")'); // relative-path only
    expect(shared).toContain('startsWith("//")'); // protocol-relative breakout
    expect(shared).toContain('includes("\\\\")'); // backslash tricks
  });
});
