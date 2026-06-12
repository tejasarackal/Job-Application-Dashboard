import { describe, it, expect } from "vitest";
import { contactTitlesFor } from "./researchLeads";
import type { ScoringPrefs } from "./filters";

const owner: ScoringPrefs = {
  titleKeywords: ["data engineer"],
  locations: ["san jose"],
  disqualifiedMetros: [],
  remotePref: "onsite_ok",
  ownerTitleTiers: true,
};
const tpm: ScoringPrefs = {
  titleKeywords: ["program manager"],
  locations: [],
  disqualifiedMetros: [],
  remotePref: "no_preference",
};

describe("contactTitlesFor (Apollo person_titles, Phase 4)", () => {
  it("owner → the curated DE hiring-manager list (unchanged)", () => {
    const titles = contactTitlesFor(owner);
    expect(titles).toContain("Data Engineering Manager");
    expect(titles).toContain("Head of Data");
  });
  it("member → contact titles derived from THEIR role, not DE", () => {
    const titles = contactTitlesFor(tpm);
    // Finds the member's own function + leadership variants…
    expect(titles).toContain("Program Manager");
    expect(titles.some((t) => /Director of Program Manager|Head of Program Manager/.test(t))).toBe(true);
    // …and never the owner's DE recruiter titles (the reported bug for research).
    expect(titles).not.toContain("Data Engineering Manager");
    expect(titles).not.toContain("Head of Data");
  });
  it("keeps the Apollo query bounded (≤10 titles)", () => {
    const many: ScoringPrefs = { ...tpm, titleKeywords: ["a", "b", "c", "d", "e"] };
    expect(contactTitlesFor(many).length).toBeLessThanOrEqual(10);
  });
});
