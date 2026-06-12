import { describe, it, expect } from "vitest";
import { DE_KEYWORDS, linkedinKeywordQuery, searchKeywordsFor, linkedinLocationFor } from "./keywords";
import type { ScoringPrefs } from "../filters";

const owner: ScoringPrefs = {
  titleKeywords: ["data engineer"],
  locations: ["san jose"],
  disqualifiedMetros: [],
  remotePref: "onsite_ok",
  ownerTitleTiers: true,
};
const tpmNeutral: ScoringPrefs = {
  titleKeywords: ["technical program manager", "program manager"],
  locations: [],
  disqualifiedMetros: [],
  remotePref: "no_preference",
};
const seattle: ScoringPrefs = { ...tpmNeutral, locations: ["seattle"] };
const emptyMember: ScoringPrefs = { titleKeywords: [], locations: [], disqualifiedMetros: [], remotePref: "no_preference" };

describe("searchKeywordsFor (source search terms, Phase 4)", () => {
  it("owner → DE_KEYWORDS (byte-for-byte legacy)", () => {
    expect(searchKeywordsFor(owner)).toEqual([...DE_KEYWORDS]);
  });
  it("member → THEIR own title keywords (so the source returns their roles)", () => {
    expect(searchKeywordsFor(tpmNeutral)).toEqual(["technical program manager", "program manager"]);
  });
  it("member with empty keywords → falls back to DE_KEYWORDS (defensive)", () => {
    expect(searchKeywordsFor(emptyMember)).toEqual([...DE_KEYWORDS]);
  });
});

describe("linkedinLocationFor (Phase 4)", () => {
  it("owner → Bay Area; member → their first location; neutral → United States", () => {
    expect(linkedinLocationFor(owner)).toBe("San Francisco Bay Area");
    expect(linkedinLocationFor(seattle)).toBe("seattle");
    expect(linkedinLocationFor(tpmNeutral)).toBe("United States");
  });
});

describe("linkedinKeywordQuery", () => {
  it("OR-joins + quotes multi-word phrases; defaults to DE_KEYWORDS", () => {
    expect(linkedinKeywordQuery(["program manager", "tpm"])).toBe('"program manager" OR tpm');
    expect(linkedinKeywordQuery()).toContain('"data engineer"');
  });
  it("empty list → DE_KEYWORDS fallback", () => {
    expect(linkedinKeywordQuery([])).toContain('"data engineer"');
  });
});
