// scoring.test.ts — UserPrefs → ScoringPrefs converter (PRD §13A.13, D10).
// Member conversion never leaks the owner's metro blocklist; the owner resolves
// to OWNER_PREFS (tiered title path); canComputeMatch is false with no basis.

import { describe, it, expect, afterEach } from "vitest";
import { toScoringPrefs, scoringPrefsFor, canComputeMatch } from "./scoring";
import { neutralDefaults, type UserPrefs } from "./prefs";
import { OWNER_PREFS } from "@/lib/workflows/filters";

const OWNER = "owner@example.com";
const origOwner = process.env.OWNER_EMAIL;
afterEach(() => {
  if (origOwner === undefined) delete process.env.OWNER_EMAIL;
  else process.env.OWNER_EMAIL = origOwner;
});

const memberPrefs: UserPrefs = {
  v: 1,
  identity: {},
  jobPrefs: { titleKeywords: ["data engineer"], locations: ["Austin"], remotePref: "remote_only" },
};

describe("toScoringPrefs (member conversion)", () => {
  it("never leaks the owner's metro blocklist (disqualifiedMetros always [])", () => {
    const out = toScoringPrefs(memberPrefs);
    expect(out.disqualifiedMetros).toEqual([]);
    // The owner's metro list is non-empty; the member's must NOT equal it.
    expect(out.disqualifiedMetros).not.toEqual(OWNER_PREFS.disqualifiedMetros);
  });

  it("carries the member's own keywords/locations/remotePref (no owner tiers)", () => {
    const out = toScoringPrefs(memberPrefs);
    expect(out.titleKeywords).toEqual(["data engineer"]);
    expect(out.locations).toEqual(["Austin"]);
    expect(out.remotePref).toBe("remote_only");
    expect(out.ownerTitleTiers).toBeUndefined();
  });

  it("copies arrays so the caller cannot mutate the source prefs", () => {
    const out = toScoringPrefs(memberPrefs);
    out.titleKeywords.push("injected");
    expect(memberPrefs.jobPrefs.titleKeywords).toEqual(["data engineer"]);
  });
});

describe("scoringPrefsFor (identity-aware)", () => {
  it("owner email → OWNER_PREFS (tiered title path)", () => {
    process.env.OWNER_EMAIL = OWNER;
    const out = scoringPrefsFor(OWNER, neutralDefaults());
    expect(out).toBe(OWNER_PREFS);
    expect(out.ownerTitleTiers).toBe(true);
    expect(out.disqualifiedMetros.length).toBeGreaterThan(0);
  });

  it("non-owner email → member conversion (neutral blocklist)", () => {
    process.env.OWNER_EMAIL = OWNER;
    const out = scoringPrefsFor("member@example.com", memberPrefs);
    expect(out).not.toBe(OWNER_PREFS);
    expect(out.disqualifiedMetros).toEqual([]);
    expect(out.ownerTitleTiers).toBeUndefined();
  });
});

describe("canComputeMatch (compute-on-save gate)", () => {
  it("false when there are no keywords and no owner tiers", () => {
    expect(canComputeMatch(toScoringPrefs(neutralDefaults()))).toBe(false);
  });

  it("true with title keywords", () => {
    expect(canComputeMatch(toScoringPrefs(memberPrefs))).toBe(true);
  });

  it("true for the owner (ownerTitleTiers path, even with no keyword list match)", () => {
    expect(canComputeMatch(OWNER_PREFS)).toBe(true);
  });
});
