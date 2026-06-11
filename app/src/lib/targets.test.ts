// targets.test.ts — per-user target math (PRD §13A.15, §6.4, D8/R-5).
// effectiveTargets = (mode==="h1b_all" ? MASTER : ∅) − excluded + added.
// diffTargets is pure + idempotent; existing rows matched on (key,status) are
// KEPT (never delete-and-recreate — preserves admin-set H1B Verified, C3);
// out-of-mode deviations stay inert across a mode flip.

import { describe, it, expect } from "vitest";
import {
  effectiveTargets,
  diffTargets,
  type MasterCompany,
  type TargetDeviation,
  type TargetsPutInput,
} from "./targets";

const MASTER: MasterCompany[] = [
  { key: "acme", name: "Acme" },
  { key: "globex", name: "Globex" },
  { key: "initech", name: "Initech" },
];

describe("effectiveTargets", () => {
  it("h1b_all − excluded + added (custom)", () => {
    const devs: TargetDeviation[] = [
      { id: "r1", companyKey: "globex", status: "excluded" },
      { id: "r2", companyKey: "newco", status: "added", companyName: "NewCo" },
    ];
    const { companies, counts } = effectiveTargets(MASTER, "h1b_all", devs);
    const keys = companies.map((c) => c.key).sort();
    expect(keys).toEqual(["acme", "initech", "newco"]);
    expect(counts.excluded).toBe(1);
    expect(counts.added).toBe(1);
    // newco is a custom with no admin verify → pendingVerification, excluded
    // from automation.
    const newco = companies.find((c) => c.key === "newco")!;
    expect(newco.source).toBe("custom");
    expect(newco.h1bVerified).toBe(false);
    expect(newco.pendingVerification).toBe(true);
  });

  it("none-mode yields only explicitly-added companies (master base empty)", () => {
    const devs: TargetDeviation[] = [
      { id: "r1", companyKey: "acme", status: "added", companyName: "Acme" },
    ];
    const { companies } = effectiveTargets(MASTER, "none", devs);
    expect(companies.map((c) => c.key)).toEqual(["acme"]);
    // Re-added master row is verified-by-construction (source master).
    expect(companies[0].source).toBe("master");
    expect(companies[0].pendingVerification).toBe(false);
  });

  it("custom added rows carry pendingVerification until admin-verified", () => {
    const devs: TargetDeviation[] = [
      { id: "r1", companyKey: "verifiedco", status: "added", companyName: "VerifiedCo", h1bVerified: true },
      { id: "r2", companyKey: "pendingco", status: "added", companyName: "PendingCo" },
    ];
    const { companies } = effectiveTargets(MASTER, "none", devs);
    const v = companies.find((c) => c.key === "verifiedco")!;
    const p = companies.find((c) => c.key === "pendingco")!;
    expect(v.h1bVerified).toBe(true);
    expect(v.pendingVerification).toBe(false);
    expect(p.pendingVerification).toBe(true);
  });
});

describe("diffTargets (idempotence + preservation + inertness)", () => {
  const apply = (
    input: TargetsPutInput,
    existing: TargetDeviation[],
  ): TargetDeviation[] => {
    const diff = diffTargets(input, MASTER, existing);
    const kept = existing.filter((r) => !r.id || !diff.delete.includes(r.id));
    // Simulate Airtable assigning ids to created rows.
    const created = diff.create.map((d, i) => ({ ...d, id: `new${i}` }));
    return [...kept, ...created];
  };

  it("running the same input twice yields empty create+delete (idempotent)", () => {
    const input: TargetsPutInput = {
      defaultMode: "h1b_all",
      selections: [{ companyKey: "globex", enabled: false }], // exclude globex
      custom: [{ name: "NewCo" }],
    };
    const after1 = apply(input, []);
    const diff2 = diffTargets(input, MASTER, after1);
    expect(diff2.create).toEqual([]);
    expect(diff2.delete).toEqual([]);
  });

  it("matched existing row is KEPT (not in delete set) — preserves H1B Verified", () => {
    const existing: TargetDeviation[] = [
      { id: "keepme", companyKey: "customx", status: "added", companyName: "CustomX", h1bVerified: true },
    ];
    const input: TargetsPutInput = {
      defaultMode: "h1b_all",
      selections: [],
      custom: [{ name: "CustomX" }], // same custom re-submitted
    };
    const diff = diffTargets(input, MASTER, existing);
    expect(diff.delete).not.toContain("keepme");
    expect(diff.delete).toEqual([]);
    // Nothing recreated — the verified row survives untouched.
    expect(diff.create).toEqual([]);
  });

  it("out-of-mode deviations are inert and survive a mode flip", () => {
    // An exclusion row is governable in h1b_all but inert in none.
    const existing: TargetDeviation[] = [
      { id: "exc", companyKey: "globex", status: "excluded" },
    ];
    // Flip to none-mode with no selections/custom: the exclusion is out-of-mode
    // (none has no master base to subtract from) → must NOT be deleted.
    const noneInput: TargetsPutInput = { defaultMode: "none", selections: [], custom: [] };
    const diff = diffTargets(noneInput, MASTER, existing);
    expect(diff.delete).not.toContain("exc");
    expect(diff.delete).toEqual([]);
    // Flipping back to h1b_all re-honors it without recreation.
    const backInput: TargetsPutInput = {
      defaultMode: "h1b_all",
      selections: [{ companyKey: "globex", enabled: false }],
      custom: [],
    };
    const back = diffTargets(backInput, MASTER, existing);
    expect(back.create).toEqual([]); // already present
    expect(back.delete).toEqual([]);
  });
});
