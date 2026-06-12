import { describe, it, expect } from "vitest";
import {
  isH1bSponsor,
  isDeTitle,
  titleMatches,
  DE_TITLE_RE,
  checkLocation,
  canonicalJobKey,
  canonicalUrl,
  roleKey,
  matchScore,
  isFresh,
  normalizeCompany,
  OWNER_PREFS,
  BAY_AREA_CITIES,
  type ScoringPrefs,
} from "./filters";
import { DE_KEYWORDS } from "./boards/keywords";
import { tejasDefaults, neutralDefaults, prefsOrNeutral } from "@/lib/prefs";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// Synthetic member prefs for the de-hardcoding tests (Phase 4).
const tpmPrefs: ScoringPrefs = {
  titleKeywords: ["technical program manager", "program manager"],
  locations: [],
  disqualifiedMetros: [],
  remotePref: "no_preference",
};
const seattlePrefs: ScoringPrefs = {
  titleKeywords: ["program manager"],
  locations: ["seattle"],
  disqualifiedMetros: [],
  remotePref: "no_preference",
};

describe("titleMatches (per-user title gate, Phase 4)", () => {
  it("owner path keeps DE titles (byte-for-byte DE regex), drops non-DE", () => {
    expect(titleMatches("Senior Data Engineer", OWNER_PREFS)).toBe(true);
    expect(titleMatches("Staff Technical Program Manager", OWNER_PREFS)).toBe(false);
  });
  it("member path keeps THEIR role, drops the owner's DE roles", () => {
    expect(titleMatches("Senior Technical Program Manager", tpmPrefs)).toBe(true);
    expect(titleMatches("Program Manager, Payments", tpmPrefs)).toBe(true);
    expect(titleMatches("Senior Data Engineer", tpmPrefs)).toBe(false); // the reported bug
  });
  it("excludes interns/new-grad for EVERYONE (FTE rule), regardless of keywords", () => {
    expect(titleMatches("Data Engineer Intern", OWNER_PREFS)).toBe(false);
    expect(titleMatches("Program Manager Intern", tpmPrefs)).toBe(false);
    expect(titleMatches("New Grad Program Manager", tpmPrefs)).toBe(false);
  });
  it("empty member keywords → matches nothing (no basis to filter)", () => {
    const empty: ScoringPrefs = { titleKeywords: [], locations: [], disqualifiedMetros: [], remotePref: "no_preference" };
    expect(titleMatches("Anything At All", empty)).toBe(false);
  });
});

describe("checkLocation (per-user location gate, Phase 4)", () => {
  it("a Seattle member accepts Seattle and does NOT auto-accept Bay-Area-only roles", () => {
    expect(checkLocation("Seattle, WA", seattlePrefs).pass).toBe(true);
    // "San Jose" is not in the Seattle member's locations and carries no US/remote
    // token, so it is not auto-accepted (it isn't the owner's Bay-Area list).
    expect(checkLocation("San Jose, CA", seattlePrefs).pass).toBe(false);
  });
  it("neutral member (no locations) passes everything at the vague tier", () => {
    expect(checkLocation("Anywhere, Mars", tpmPrefs).pass).toBe(true);
  });
  it("owner still rejects Seattle and accepts a Bay-Area city (parity)", () => {
    expect(checkLocation("Seattle, WA", OWNER_PREFS).pass).toBe(false);
    expect(checkLocation("Mountain View, CA", OWNER_PREFS).pass).toBe(true);
  });
});

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

describe("canonicalUrl", () => {
  it("strips LinkedIn slug + tracking params to the bare /jobs/view/{id}", () => {
    expect(
      canonicalUrl(
        "https://www.linkedin.com/jobs/view/sr-data-engineer-at-adobe-4401883451?position=29&pageNum=0&refId=abc%3D%3D&trackingId=def",
      ),
    ).toBe("https://www.linkedin.com/jobs/view/4401883451");
    expect(canonicalUrl("https://www.linkedin.com/jobs/view/4420225049")).toBe(
      "https://www.linkedin.com/jobs/view/4420225049",
    );
  });
  it("canonicalizes Greenhouse to the job-boards host without query", () => {
    expect(canonicalUrl("https://boards.greenhouse.io/chime/jobs/8505462002?gh_jid=8505462002")).toBe(
      "https://job-boards.greenhouse.io/chime/jobs/8505462002",
    );
    expect(canonicalUrl("https://job-boards.greenhouse.io/clickhouse/jobs/6000537004")).toBe(
      "https://job-boards.greenhouse.io/clickhouse/jobs/6000537004",
    );
  });
  it("strips a Workday /en-US/ locale + query, keeping {host}/{site}{path}", () => {
    expect(
      canonicalUrl("https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/Sr-Data-Engineer_R166280?src=x"),
    ).toBe("https://adobe.wd5.myworkdayjobs.com/external_experienced/job/San-Jose/Sr-Data-Engineer_R166280");
    // already-canonical Workday URL is unchanged
    expect(
      canonicalUrl("https://paypal.wd1.myworkdayjobs.com/jobs/job/San-Jose/Staff-Data-Engineer_R0135832-1"),
    ).toBe("https://paypal.wd1.myworkdayjobs.com/jobs/job/San-Jose/Staff-Data-Engineer_R0135832-1");
  });
  it("strips query/suffix from Lever and Ashby (id is in the path)", () => {
    expect(canonicalUrl("https://jobs.lever.co/plaid/abc123def456?lever-source=x")).toBe(
      "https://jobs.lever.co/plaid/abc123def456",
    );
    expect(canonicalUrl("https://jobs.ashbyhq.com/notion/a1216dba-e175-4a3d-b712-401c9fbdcd92/application")).toBe(
      "https://jobs.ashbyhq.com/notion/a1216dba-e175-4a3d-b712-401c9fbdcd92",
    );
    expect(canonicalUrl(undefined)).toBe("");
  });
  it("leaves unknown 'Other' URLs untouched (the id may live only in ?gh_jid= or a #route)", () => {
    // Dropping the query here would dead-end these custom-domain Greenhouse boards.
    expect(canonicalUrl("https://www.pinterestcareers.com/jobs/?gh_jid=7782546")).toBe(
      "https://www.pinterestcareers.com/jobs/?gh_jid=7782546",
    );
    expect(canonicalUrl("https://instacart.careers/job/?gh_jid=7951036")).toBe(
      "https://instacart.careers/job/?gh_jid=7951036",
    );
    expect(canonicalUrl("https://www.tesla.com/careers/search/job/sr-data-engineer-264796")).toBe(
      "https://www.tesla.com/careers/search/job/sr-data-engineer-264796",
    );
  });
  it("preserves the canonicalJobKey (so dedup is unchanged after normalization)", () => {
    const urls = [
      "https://www.linkedin.com/jobs/view/sr-data-engineer-at-adobe-4401883451?refId=x",
      "https://boards.greenhouse.io/chime/jobs/8505462002?gh_jid=8505462002",
      "https://adobe.wd5.myworkdayjobs.com/en-US/external_experienced/job/San-Jose/Sr-Data-Engineer_R166280",
    ];
    for (const u of urls) expect(canonicalJobKey(canonicalUrl(u)).key).toBe(canonicalJobKey(u).key);
  });
});

describe("roleKey", () => {
  it("treats Sr./Senior (and Jr./Junior) as the same role at the same company", () => {
    expect(roleKey("Adobe", "Sr. Data Engineer")).toBe(roleKey("Adobe Inc.", "Senior Data Engineer"));
    expect(roleKey("PayPal", "Jr Data Engineer")).toBe(roleKey("PayPal", "Junior Data Engineer"));
  });
  it("keeps genuinely-different titles distinct (full title, not truncated)", () => {
    // Two real Snowflake roles that a 24-char truncation would have merged.
    expect(roleKey("Snowflake", "Senior Software Engineer, Data Platform")).not.toBe(
      roleKey("Snowflake", "Senior Software Engineer, Streaming Ingest"),
    );
  });
  it("ignores company legal suffixes and punctuation", () => {
    expect(roleKey("DoorDash, Inc.", "Senior Software Engineer")).toBe(
      roleKey("DoorDash", "Senior Software Engineer"),
    );
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

// ── Multi-user prefs path (PRD-multi-user §6.2 / D10) — additive only ────────
// The existing cases above pin the default (OWNER_PREFS) path; these pin the
// new prefs-parameterized behavior for members.
describe("prefs-aware scoring (multi-user)", () => {
  const neutral: ScoringPrefs = {
    titleKeywords: [],
    locations: [],
    disqualifiedMetros: [],
    remotePref: "no_preference",
  };
  const custom = (over: Partial<ScoringPrefs>): ScoringPrefs => ({ ...neutral, ...over });

  it("explicit OWNER_PREFS equals the no-arg default path", () => {
    const it1 = { title: "Senior Data Engineer", location: "San Francisco, CA", postedAt: daysAgo(1) };
    const it2 = { title: "Software Engineer", location: "Seattle, WA" };
    expect(matchScore(it1, OWNER_PREFS)).toBe(matchScore(it1));
    expect(matchScore(it2, OWNER_PREFS)).toBe(matchScore(it2));
    expect(checkLocation("Remote - Brazil", OWNER_PREFS)).toEqual(checkLocation("Remote - Brazil"));
  });

  it("custom keywords match (flat 45 title tier, owner lists never applied)", () => {
    const prefs = custom({ titleKeywords: ["reliability engineer"], locations: ["austin"] });
    // austin is in the OWNER disqualified-metro list — a member targeting it must pass.
    expect(checkLocation("Austin, TX", prefs)).toEqual({ pass: true, reason: "acceptable" });
    // title 45 + seniority 12 + location 20 + recency 6 (undated) = 83
    expect(matchScore({ title: "Platform Reliability Engineer", location: "Austin, TX" }, prefs)).toBe(83);
    // non-matching title scores 0 on the title component: 0 + 12 + 20 + 6 = 38
    expect(matchScore({ title: "Account Executive", location: "Austin, TX" }, prefs)).toBe(38);
  });

  it("neutral prefs: location-neutral vague tier (12), title component 0", () => {
    expect(checkLocation("Bangalore, India", neutral)).toEqual({ pass: true, reason: "location_neutral" });
    expect(checkLocation(undefined, neutral).pass).toBe(true); // no list ⇒ nothing to fail on
    // title 0 (no keywords) + seniority 20 (senior) + location 12 + recency 6 = 38
    expect(matchScore({ title: "Senior Data Engineer", location: "Bangalore, India" }, neutral)).toBe(38);
    // never the 16/20 "acceptable" tier, even for a named Bay-Area city
    expect(matchScore({ title: "X", location: "San Francisco, CA" }, neutral)).toBe(
      matchScore({ title: "X", location: "Anywhere At All" }, neutral),
    );
  });

  it("regex-escapes hostile keywords (never compiles raw user input)", () => {
    const prefs = custom({ titleKeywords: ["c++ (data)"] });
    // would throw at RegExp-compile time if unescaped
    expect(matchScore({ title: "C++ (Data) Engineer" }, prefs)).toBe(45 + 12 + 12 + 6);
    expect(matchScore({ title: "C Data Engineer" }, prefs)).toBe(0 + 12 + 12 + 6); // literal, not pattern, match
  });

  it("tejasDefaults stays in lockstep with OWNER_PREFS / BAY_AREA_CITIES", () => {
    const t = tejasDefaults();
    expect(t.jobPrefs.titleKeywords).toEqual(OWNER_PREFS.titleKeywords);
    expect(t.jobPrefs.locations).toEqual(BAY_AREA_CITIES);
    expect(t.jobPrefs.remotePref).toBe(OWNER_PREFS.remotePref);
  });

  it("prefsOrNeutral never resolves arbitrary input to the owner's prefs", () => {
    expect(prefsOrNeutral(undefined)).toEqual(neutralDefaults());
    expect(prefsOrNeutral("not json {{{")).toEqual(neutralDefaults());
    expect(prefsOrNeutral(JSON.stringify({ v: 2, anything: true }))).toEqual(neutralDefaults());
  });
});
