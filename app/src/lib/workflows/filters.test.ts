import { describe, it, expect } from "vitest";
import {
  isH1bSponsor,
  isDeTitle,
  DE_TITLE_RE,
  checkLocation,
  canonicalJobKey,
  matchScore,
  isFresh,
  normalizeCompany,
} from "./filters";
import { DE_KEYWORDS } from "./boards/keywords";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

describe("isH1bSponsor", () => {
  it("matches registry sponsors exactly and via legal-suffix normalization", () => {
    expect(isH1bSponsor("Stripe Inc.")).toBe(true);
    expect(isH1bSponsor("Stripe")).toBe(true); // normalized
    expect(isH1bSponsor("Tesla")).toBe(true);
  });
  it("rejects non-sponsors and empty", () => {
    expect(isH1bSponsor("Definitely Not A Real Company")).toBe(false);
    expect(isH1bSponsor(undefined)).toBe(false);
    expect(isH1bSponsor("")).toBe(false);
  });
});

describe("isDeTitle", () => {
  it("accepts DE-family titles", () => {
    expect(isDeTitle("Senior Data Engineer")).toBe(true);
    expect(isDeTitle("Analytics Engineer")).toBe(true);
    expect(isDeTitle("Staff Data Platform Engineer")).toBe(true);
    expect(isDeTitle("Data Infrastructure Engineer")).toBe(true);
  });
  it("accepts DE-adjacent titles (the broadened gate)", () => {
    expect(isDeTitle("Database Engineer")).toBe(true);
    expect(isDeTitle("Data Warehouse Engineer")).toBe(true);
    expect(isDeTitle("ETL Developer")).toBe(true);
    expect(isDeTitle("Senior Data Pipeline Engineer")).toBe(true);
    expect(isDeTitle("Data Architect")).toBe(true);
    expect(isDeTitle("Software Engineer, Data Platform")).toBe(true);
  });
  it("rejects non-DE titles (incl. ML/DS/analyst, kept out of scope)", () => {
    expect(isDeTitle("Software Engineer")).toBe(false);
    expect(isDeTitle("Data Scientist")).toBe(false);
    expect(isDeTitle("Data Analyst")).toBe(false);
    expect(isDeTitle("Machine Learning Engineer")).toBe(false);
    expect(isDeTitle(undefined)).toBe(false);
  });
  it("excludes interns / co-ops / new-grad (the leak we fixed)", () => {
    expect(isDeTitle("Internship, Data Engineer, Fleet Data")).toBe(false);
    expect(isDeTitle("Data Engineer Co-op")).toBe(false);
    expect(isDeTitle("New Grad Data Engineer")).toBe(false);
  });
  it("accepts the four real-world misses that triggered the coverage fix", () => {
    expect(isDeTitle("Sr. Data Engineer, Enterprise - Slack")).toBe(true);
    expect(isDeTitle("Analytics Engineer – People Data")).toBe(true); // en-dash, not hyphen
    expect(isDeTitle("Senior Data Engineer")).toBe(true);
    expect(isDeTitle("Staff Data Engineer - Technical Strategic Programs")).toBe(true);
  });
});

describe("DE_KEYWORDS / DE_TITLE_RE sync", () => {
  // A source keyword that the title gate would reject is wasted work (it can only
  // pull in titles collectRows() then drops). Keep the two in lockstep.
  it("every shared search keyword satisfies the DE title gate", () => {
    for (const kw of DE_KEYWORDS) expect(DE_TITLE_RE.test(kw)).toBe(true);
  });
});

describe("checkLocation", () => {
  it("passes Bay Area + CA/US remote", () => {
    expect(checkLocation("San Francisco, CA").pass).toBe(true);
    expect(checkLocation("Sunnyvale, CA").pass).toBe(true);
    expect(checkLocation("Remote - United States").pass).toBe(true);
  });
  it("accepts ambiguous US/remote values (sources are already US-scoped)", () => {
    expect(checkLocation("Remote").pass).toBe(true);
    expect(checkLocation("United States").pass).toBe(true);
    expect(checkLocation("Multiple Locations").pass).toBe(true);
  });
  it("fails disqualifying / unknown / empty", () => {
    expect(checkLocation("Seattle, WA").pass).toBe(false);
    expect(checkLocation("Bellevue, Washington").pass).toBe(false); // Seattle-metro, not Bay Area
    expect(checkLocation("Bangalore, India").pass).toBe(false);
    expect(checkLocation("Remote - Bangalore").pass).toBe(false); // disqualifier wins over bare "remote"
    expect(checkLocation("").pass).toBe(false);
  });
  it("rejects foreign 'Remote - <country>' that the bare-remote rule used to leak", () => {
    expect(checkLocation("Remote - Brazil").pass).toBe(false);
    expect(checkLocation("Remote - India").pass).toBe(false);
    expect(checkLocation("Remote - Canada").pass).toBe(false);
    expect(checkLocation("Ireland").pass).toBe(false);
    expect(checkLocation("Brazil Remote").pass).toBe(false);
    expect(checkLocation("Dublin, Ireland").pass).toBe(false); // not Dublin, CA
    expect(checkLocation("Dublin, CA").pass).toBe(true);
    // but a US token present keeps it (US-available), and "Indiana" ≠ "India"
    expect(checkLocation("Remote - US").pass).toBe(true);
    expect(checkLocation("Indianapolis, Indiana").pass).toBe(false); // not Bay/remote, but not a false "India" match
  });
});

describe("canonicalJobKey", () => {
  it("derives stable per-ATS keys", () => {
    expect(canonicalJobKey("https://job-boards.greenhouse.io/anthropic/jobs/5229976008")).toEqual({
      board: "Greenhouse",
      key: "greenhouse:anthropic:5229976008",
    });
    expect(canonicalJobKey("https://jobs.lever.co/plaid/abc123def456").board).toBe("Lever");
    expect(canonicalJobKey("https://jobs.ashbyhq.com/notion/a1216dba-e175-4a3d-b712-401c9fbdcd92")).toEqual({
      board: "Ashby",
      key: "ashby:notion:a1216dba-e175-4a3d-b712-401c9fbdcd92",
    });
    expect(canonicalJobKey("https://nvidia.wd5.myworkdayjobs.com/Ext/job/Santa-Clara/Engineer_JR123").board).toBe(
      "Workday",
    );
  });
  it("captures LinkedIn job IDs at the END of a slug (the board='Other' bug fix)", () => {
    const k = canonicalJobKey(
      "https://www.linkedin.com/jobs/view/sr-data-engineer-at-tesla-4420225049?refId=abc",
    );
    expect(k).toEqual({ board: "LinkedIn", key: "linkedin:4420225049" });
    expect(canonicalJobKey("https://www.linkedin.com/jobs/view/4420225049").board).toBe("LinkedIn");
  });
  it("dedups the same posting across differing query strings", () => {
    const a = canonicalJobKey("https://www.linkedin.com/jobs/view/job-4420225049?a=1");
    const b = canonicalJobKey("https://www.linkedin.com/jobs/view/job-4420225049?b=2&c=3");
    expect(a.key).toBe(b.key);
    const u1 = canonicalJobKey("https://tesla.com/careers/12345/?utm=x");
    const u2 = canonicalJobKey("https://tesla.com/careers/12345?ref=y");
    expect(u1.key).toBe(u2.key);
  });
  it("returns Other + empty key for missing URLs", () => {
    expect(canonicalJobKey(undefined)).toEqual({ board: "Other", key: "" });
  });
});

describe("matchScore", () => {
  it("scores a fresh senior Bay-Area DE near the top", () => {
    const s = matchScore({ title: "Senior Data Engineer", location: "San Francisco, CA", postedAt: daysAgo(1) });
    expect(s).toBeGreaterThanOrEqual(85);
    expect(s).toBeLessThanOrEqual(100);
  });
  it("scores an off-target role low", () => {
    const s = matchScore({ title: "Software Engineer", location: "Seattle, WA" });
    expect(s).toBeLessThan(45);
  });
  it("always stays within 0..100", () => {
    expect(matchScore({})).toBeGreaterThanOrEqual(0);
    expect(matchScore({ title: "Data Engineer", actorScore: 99 })).toBeLessThanOrEqual(100);
  });
});

describe("isFresh", () => {
  it("respects the window and fails closed when undated", () => {
    expect(isFresh(daysAgo(1), 7)).toBe(true);
    expect(isFresh(daysAgo(40), 7)).toBe(false);
    expect(isFresh(undefined, 7)).toBe(false);
    expect(isFresh(undefined, undefined)).toBe(true); // no window requested
  });
});

describe("normalizeCompany", () => {
  it("strips legal suffixes + punctuation", () => {
    expect(normalizeCompany("Stripe Inc.")).toBe("stripe");
    expect(normalizeCompany("Block, Inc.")).toBe("block");
    expect(normalizeCompany("Acme Corporation")).toBe("acme");
  });
});
