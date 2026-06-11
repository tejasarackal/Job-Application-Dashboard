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

// ── M2 isolation guardrails (PRD §9 G5–G13) ──────────────────────────────────
// Source-scan style, mirroring the M0 block above. Each assertion is written to
// FAIL on the regression it guards against (isolation hole reintroduced).
describe("M2 isolation guardrails", () => {
  const SRC2 = path.resolve(process.cwd(), "src");
  const srcFile = (rel: string) => readFileSync(path.join(SRC2, rel), "utf8");

  // Every *.ts source file (no test files), as {file,text}.
  const allFiles = allSource(SRC2);
  const fileText = (rel: string) => srcFile(rel);

  // Collect every route.ts under a directory (empty when the dir is absent).
  function routeFilesUnder(rel: string): string[] {
    const dir = path.join(SRC2, rel);
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) out.push(...routeFilesUnder(path.relative(SRC2, full)));
      else if (name === "route.ts") out.push(full);
    }
    return out;
  }
  const allRoutes = routeFilesUnder("app/api");
  const posix = (p: string) => p.replace(/\\/g, "/");

  // ── G5 — owned readers declare their tenant; unowned readers do not ─────────
  it("G5: owned list* readers take a required userEmail and owner-filter; unowned do not", () => {
    const air = fileText("lib/airtable.ts");
    const ownedReaders = [
      "listJobListings",
      "listApplications",
      "listInterviews",
      "listOutreach",
      "listLeads",
      "listAllOutreach",
      "listWorkflowRuns",
    ];
    for (const fn of ownedReaders) {
      // `export async function listX(\n  userEmail: string` (allow newline/ws).
      const re = new RegExp(`function ${fn}\\(\\s*userEmail: string`);
      expect(air, `${fn} must take a required userEmail first param`).toMatch(re);
    }
    // The owner-filter helper + the defense-in-depth post-filter both exist.
    expect(air).toMatch(/ownerFilter\(/);
    expect(air).toMatch(/postFilterOwned\(/);
    // The runtime tenancy guard: an owned-table read without a filter throws.
    expect(air).toMatch(/owned table read without owner filter/);

    // Unowned readers must NOT take a userEmail param (global/shared reads).
    for (const fn of ["listTargets", "listScrapeTargets", "listH1bLinkedinIds"]) {
      const sig = air.match(new RegExp(`function ${fn}\\(([^)]*)\\)`));
      expect(sig, `${fn} declaration not found`).toBeTruthy();
      expect(sig![1], `${fn} must NOT take userEmail`).not.toMatch(/userEmail/);
    }
  });

  // ── G6 — no unauthenticated route exists ────────────────────────────────────
  it("G6: every api route (minus pinned exemptions) calls requireUserApi/requireAdminApi", () => {
    const EXEMPT = ["api/auth/", "api/cron/", "api/health/"];
    const offenders: string[] = [];
    for (const f of allRoutes) {
      const rel = posix(f);
      if (EXEMPT.some((e) => rel.includes(e))) continue;
      const text = readFileSync(f, "utf8");
      if (!/require(User|Admin)Api\(/.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  // ── G7 — no mutation without ownership proof ────────────────────────────────
  it("G7: mutating routes prove ownership (assertOwnership / withOwner / owner stamp)", () => {
    const offenders: string[] = [];
    for (const f of allRoutes) {
      const rel = posix(f);
      const text = readFileSync(f, "utf8");
      const mutates = /updateRecords\(|createRecords\(/.test(text);
      if (!mutates) continue;
      const provesOwnership =
        /assertOwnership\(/.test(text) ||
        /withOwner\(/.test(text) ||
        /FIELDS\.userTargets\.userEmail/.test(text) || // targets route explicit stamp
        /\[f\.actorEmail\]|\[f\.targetEmail\]|normalizeEmail\(/.test(text); // admin/migrate owner-field stamp
      if (!provesOwnership) offenders.push(rel);
    }
    expect(offenders).toEqual([]);

    // Engine writer files (those that create/update owned rows) stamp owner.
    const enginePath = path.join(SRC2, "lib/workflows");
    const engineWriters = readdirSync(enginePath)
      .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))
      .map((n) => ({ name: n, text: readFileSync(path.join(enginePath, n), "utf8") }))
      // Only files that create owned rows must carry withOwner.
      .filter((f) => /createRecords\(\s*TABLES\.(jobListings|applications|interviews|leads)/.test(f.text));
    const engineOffenders = engineWriters.filter((f) => !/withOwner\(/.test(f.text)).map((f) => f.name);
    expect(engineOffenders).toEqual([]);
  });

  // ── G8 — middleware fronts everything ───────────────────────────────────────
  // The M0 block ("middleware exists and its pinned matcher exempts only the
  // canonical set") already pins the matcher exactly. We do NOT duplicate it;
  // instead we assert here only the G8-specific delta the M2 PRD spells out:
  // the matcher literal contains each exemption token and none of the fronted
  // surface tokens — a thin reference so a regression fails in BOTH blocks.
  it("G8: matcher (pinned by M0) exempts the canonical set and fronts member surfaces", () => {
    const text = fileText("middleware.ts");
    const matcher = text.match(/matcher:\s*\[([\s\S]*?)\]/);
    expect(matcher, "config.matcher literal not found").toBeTruthy();
    const literal = matcher![1];
    for (const exempt of [
      "login",
      "privacy",
      "terms",
      "api/auth",
      "api/cron",
      "api/health",
      "_next",
      "favicon",
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

  // ── G9 — mock never crosses the prod auth boundary ──────────────────────────
  it("G9: the mock module is imported only by fetcher.ts; fetcher guards prod", () => {
    // An IMPORT of the mock module (not a comment/string mention of the word).
    const importsMock = (text: string) =>
      /import[\s\S]*?from\s*["'](?:\.{1,2}\/)*(?:lib\/)?mock["']/.test(text);
    const importers = allFiles
      .filter((f) => importsMock(f.text))
      .map((f) => posix(f.file));
    expect(importers).toHaveLength(1);
    expect(importers[0]).toMatch(/lib\/fetcher\.ts$/);
    // No src/app/** file imports the mock module.
    expect(importers.find((p) => /\/src\/app\//.test(p))).toBeUndefined();

    // fetcher's mock-return path is guarded by a NODE_ENV !== "production" check
    // (isProd()) so fixtures never surface inside a prod session.
    const fetcher = fileText("lib/fetcher.ts");
    expect(fetcher).toMatch(/NODE_ENV\s*===?\s*["']production["']/);
    expect(fetcher).toMatch(/source:\s*"mock"/);
    // Every `source:"mock"` return sits behind an isProd() / prod guard: the
    // mock branch is only ever reached after the prod branch returns.
    expect(fetcher).toMatch(/if\s*\(isProd\(\)\)[\s\S]*?source:\s*"mock"/);
  });

  // ── G10 — view-as is read-only, structurally ────────────────────────────────
  it("G10: data writes use session.email (never effectiveEmail); mutating routes assertWritable", () => {
    // (a) No DATA write path reads effectiveEmail to drive a write. The viewas
    // COOKIE token is `viewas` (no hyphen); the admin "view-as" routes are the
    // hyphenated dir name — encode the exemption on the route path precisely so
    // the hyphenated "view-as" string never trips the cookie-token scan.
    const WRITE_EXEMPT = [
      "app/api/admin/", // migrate/users/view-as legitimately write admin rows
    ];
    const offenders: string[] = [];
    for (const f of allRoutes) {
      const rel = posix(f);
      if (WRITE_EXEMPT.some((e) => rel.includes(e))) continue;
      const text = readFileSync(f, "utf8");
      const writes = /updateRecords\(|createRecords\(|createDraft\(/.test(text);
      if (!writes) continue;
      // The write must NOT be keyed off effectiveEmail.
      if (/effectiveEmail/.test(text) && !/session\.email/.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);

    // (b) No data page/fetcher write path reads the `viewas` cookie + writes.
    // fetcher.ts (the read layer) must contain neither a write call nor the
    // viewas cookie token.
    const fetcher = fileText("lib/fetcher.ts");
    expect(fetcher).not.toMatch(/updateRecords\(|createRecords\(|createDraft\(/);
    expect(fetcher).not.toMatch(/VIEWAS_COOKIE|verifyViewAsToken/);

    // (c) Every mutating route calls assertWritable( — except the view-as EXIT
    // path, which must always work (documented exemption: a `NO assertWritable`
    // comment marks it). The view-as route's POST does call assertWritable.
    const mutatingOffenders: string[] = [];
    for (const f of allRoutes) {
      const rel = posix(f);
      const text = readFileSync(f, "utf8");
      const mutates = /updateRecords\(|createRecords\(|createDraft\(/.test(text);
      if (!mutates) continue;
      if (!/assertWritable\(/.test(text)) mutatingOffenders.push(rel);
    }
    expect(mutatingOffenders).toEqual([]);
  });

  // ── G11 — engine identity is fail-closed ────────────────────────────────────
  // The cron half (503-on-unset, timing-safe) is already pinned by the M0 block
  // ("cron route is fail-closed…"). We do NOT duplicate it. Here we assert only
  // the engine-core half: drive.ts/execute.ts carry the OWNER_EMAIL refusal.
  it("G11: drive.ts/execute.ts refuse to run when OWNER_EMAIL is unset (fail-closed)", () => {
    const drive = fileText("lib/workflows/drive.ts");
    const execute = fileText("lib/workflows/execute.ts");
    expect(execute).toMatch(/OWNER_EMAIL_UNSET/);
    expect(execute).toMatch(/process\.env\.OWNER_EMAIL/);
    // execute returns a failed/empty result on unset, never proceeds to work.
    expect(execute).toMatch(/OWNER_EMAIL_UNSET[\s\S]*?return\s*\{[\s\S]*?ok:\s*false/);
    // drive surfaces the same refusal and returns early before driving chunks.
    expect(drive).toMatch(/OWNER_EMAIL_UNSET/);
    // The refusal returns a failed result (no chunk work) when the owner is unset.
    expect(drive).toMatch(/OWNER_EMAIL_UNSET[\s\S]{0,120}?return\s*\{[\s\S]*?ok:\s*false/);
    // Discount the import line; the refusal must precede the in-body chunk run.
    const refusal = drive.indexOf("OWNER_EMAIL_UNSET", drive.indexOf("import") + 1);
    const bodyExec = drive.indexOf("await executeChunk(");
    expect(refusal).toBeGreaterThan(-1);
    if (bodyExec > -1) expect(refusal).toBeLessThan(bodyExec);
  });

  // ── G12 — admin surface is gated, escape hatch loud ─────────────────────────
  it("G12: every admin route calls requireAdminApi; *AllAdmin call sites co-occur with requireAdmin", () => {
    const adminRoutes = routeFilesUnder("app/api/admin");
    expect(adminRoutes.length).toBeGreaterThan(0);
    const offenders = adminRoutes
      .filter((f) => !/requireAdminApi\(/.test(readFileSync(f, "utf8")))
      .map(posix);
    expect(offenders).toEqual([]);

    // Any file that CALLS a list*AllAdmin( function must also gate with
    // requireAdmin/requireAdminApi in-file (the cross-user reader is loud).
    const adminCallOffenders = allFiles
      .filter(
        (f) =>
          // call site, not the definition file (airtable.ts defines them).
          /\blist\w*AllAdmin\(/.test(f.text) && !posix(f.file).endsWith("lib/airtable.ts"),
      )
      .filter((f) => !/require(Admin|AdminApi)\(|requireAdmin\b/.test(f.text))
      .map((f) => posix(f.file));
    expect(adminCallOffenders).toEqual([]);

    // createDraft call sites are admin-gated (CR-S17): the only writer is the
    // review/draft route, which gates with requireAdminApi.
    const draftCallers = allFiles
      .filter((f) => /\bcreateDraft\(/.test(f.text) && !posix(f.file).endsWith("workflows/gmail.ts"))
      .map((f) => posix(f.file));
    for (const caller of draftCallers) {
      const text = readFileSync(caller, "utf8");
      expect(text, `${caller} calls createDraft without requireAdminApi`).toMatch(/requireAdminApi\(/);
    }
  });

  // ── G13 — no formula injection / record oracle ──────────────────────────────
  it("G13: every filterByFormula in airtable.ts flows through an escaped/validated builder", () => {
    const air = fileText("lib/airtable.ts");
    // Find every `filterByFormula:` assignment site and ensure the value is one
    // of the safe builders (ownerFilter / recordIdFilter / escapeFormulaString /
    // blankOwnerFormula) — never a raw `${...}` interpolation of an email/id.
    const SAFE = /ownerFilter\(|recordIdFilter\(|escapeFormulaString\(|blankOwnerFormula\(/;
    const lines = air.split("\n");
    const offenders: string[] = [];
    lines.forEach((line, i) => {
      if (!/filterByFormula:/.test(line)) return;
      // Inline value, or a `formula` variable assembled just above. Gather a
      // small window so AND(...)-wrapped multi-builder formulas are covered.
      const window = lines.slice(Math.max(0, i - 4), i + 2).join("\n");
      const raw = /filterByFormula:\s*`[^`]*\$\{(?:email|id|userEmail|recordId)/.test(window);
      if (raw || !SAFE.test(window)) offenders.push(`L${i + 1}: ${line.trim()}`);
    });
    expect(offenders).toEqual([]);

    // The builders themselves are injection-safe: ownerFilter validates email
    // shape + escapes; recordIdFilter shape-validates each id; escapeFormulaString
    // does backslash-then-quote and throws on control chars / empty.
    expect(air).toMatch(/function escapeFormulaString\(/);
    expect(air).toMatch(/RECORD_ID_RE|recordIdFilter/);
    expect(air).toMatch(/EMAIL_RE\.test/);
  });

  // ── G14 — per-user run boundary (Phase 3a) ──────────────────────────────────
  // Members may trigger workflows ONLY for themselves and ONLY the non-Gmail,
  // non-owner-mart ones. A member run of a Gmail workflow would hit the OWNER's
  // mailbox; the engine actor must come from the session, never the request body.
  it("G14: workflow route gates members to scrape/research and derives the actor from the session", () => {
    const route = fileText("app/api/workflows/[name]/route.ts");
    expect(route).toMatch(/requireUserApi\(/); // members can reach it
    expect(route).toMatch(/MEMBER_ALLOWED/);
    expect(route).toMatch(/!isAdmin && !MEMBER_ALLOWED\.has\(name\)[\s\S]{0,120}?40[13]/);

    const setMatch = route.match(/MEMBER_ALLOWED\s*=\s*new Set\(\[([^\]]*)\]/);
    expect(setMatch, "MEMBER_ALLOWED set literal not found").toBeTruthy();
    const allowed = setMatch![1];
    for (const forbidden of [
      "sync_applications",
      "sync_interviews",
      "draft_emails",
      "refresh_scrape_targets",
      "detect_boards",
      "revalidate_listings",
    ]) {
      expect(allowed, `MEMBER_ALLOWED must not include ${forbidden} (Gmail/owner-only)`).not.toContain(forbidden);
    }
    expect(allowed).toContain("scrape_jobs");

    // Actor identity is the authenticated session — never client-supplied.
    expect(route).toMatch(/actorEmail:\s*session\.email/);
    expect(route).not.toMatch(/actorEmail:\s*body\./);

    // A weekly quota is checked before the run (cost cap, members).
    expect(route).toMatch(/quotaStatus\(/);
  });
});
