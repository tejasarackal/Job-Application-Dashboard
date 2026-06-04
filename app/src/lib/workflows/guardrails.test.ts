import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
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
