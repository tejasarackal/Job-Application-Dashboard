import { describe, it, expect } from "vitest";
import { parseWorkdayPosted, workdayLocation, workdayReqId, parseWorkdayPostings } from "./boards/workday";
import { workdayTargets } from "@/lib/company-registry";

const daysFrom = (iso: string | undefined) =>
  iso ? (Date.now() - Date.parse(iso)) / 86_400_000 : NaN;

describe("parseWorkdayPosted", () => {
  it("maps Workday's relative text to an approximate date", () => {
    expect(daysFrom(parseWorkdayPosted("Posted Today"))).toBeLessThan(0.01);
    expect(daysFrom(parseWorkdayPosted("Posted Yesterday"))).toBeCloseTo(1, 1);
    expect(daysFrom(parseWorkdayPosted("Posted 3 Days Ago"))).toBeCloseTo(3, 1);
    expect(daysFrom(parseWorkdayPosted("Posted 27 Days Ago"))).toBeCloseTo(27, 0);
  });
  it("treats 30+ Days as old (outside a 7-day window)", () => {
    expect(daysFrom(parseWorkdayPosted("Posted 30+ Days Ago"))).toBeGreaterThan(7);
  });
  it("returns undefined for unrecognized / empty (→ kept as undated)", () => {
    expect(parseWorkdayPosted("just now")).toBeUndefined();
    expect(parseWorkdayPosted(undefined)).toBeUndefined();
    expect(parseWorkdayPosted("")).toBeUndefined();
  });
});

describe("workdayLocation", () => {
  it("recovers the real city from externalPath when locationsText is vague", () => {
    expect(
      workdayLocation({ locationsText: "2 Locations", externalPath: "/job/US-CA-Santa-Clara/Senior-Data-Engineer_JR1" }),
    ).toContain("Santa Clara");
    expect(workdayLocation({ externalPath: "/job/US-CA-Santa-Clara/X_JR1" })).toContain("Santa Clara");
  });
  it("keeps a non-Bay location identifiable (so it's correctly dropped)", () => {
    expect(workdayLocation({ locationsText: "Israel", externalPath: "/job/Israel-Tel-Hai/X_JR1" })).toMatch(/tel hai/i);
  });
});

describe("workdayReqId", () => {
  it("extracts the requisition id (segment after the last _) from externalPath", () => {
    // The exact Salesforce/Slack miss that triggered this work.
    expect(workdayReqId("/job/California---San-Francisco/Sr-Data-Engineer---Enterprise---Slack_JR341884-1")).toBe("jr341884-1");
    expect(workdayReqId("/job/US-CA-Santa-Clara/Senior-Data-Engineer_JR1")).toBe("jr1");
  });
  it("ignores query/hash and trailing slash", () => {
    expect(workdayReqId("/job/X/Role_JR9/?source=LinkedIn_Jobs")).toBe("jr9");
  });
  it("falls back to the last path segment when there is no _ ; empty for undefined", () => {
    expect(workdayReqId("/job/X/plain-slug")).toBe("plain-slug");
    expect(workdayReqId(undefined)).toBe("");
  });
});

describe("parseWorkdayPostings", () => {
  const host = "intuit.wd1.myworkdayjobs.com";
  const site = "Intuit_Careers";
  it("dedups the same requisition returned under multiple keywords/pages", () => {
    const staff = { title: "Staff Data Engineer", externalPath: "/job/US-CA-MTV/Staff-Data-Engineer_JR99", postedOn: "Posted Today" };
    const ae = { title: "Analytics Engineer", externalPath: "/job/US-CA-MTV/Analytics-Engineer_JR12" };
    // JR99 shows up under both the "data engineer" page and the "data platform" page.
    const out = parseWorkdayPostings([[staff, ae], [staff]], "Intuit Inc.", host, site);
    expect(out).toHaveLength(2);
    expect(out.map((j) => j.title)).toEqual(["Staff Data Engineer", "Analytics Engineer"]);
  });
  it("builds an absolute url from host/site/externalPath and recovers the city", () => {
    const out = parseWorkdayPostings(
      [[{ title: "Senior Data Engineer", externalPath: "/job/US-CA-Santa-Clara/Senior-Data-Engineer_JR1" }]],
      "X",
      host,
      site,
    );
    expect(out[0].url).toBe(`https://${host}/${site}/job/US-CA-Santa-Clara/Senior-Data-Engineer_JR1`);
    expect(out[0].location).toContain("Santa Clara");
    expect(out[0].company).toBe("X");
  });
  it("drops postings missing title or externalPath; tolerates empty pages", () => {
    expect(parseWorkdayPostings([], "X", host, site)).toEqual([]);
    const out = parseWorkdayPostings([[{ title: "No Path" }, { externalPath: "/job/x/y_JR2" }]], "X", host, site);
    expect(out).toEqual([]);
  });
});

describe("workdayTargets", () => {
  const targets = workdayTargets();
  it("returns directly-addressable Workday sponsors with correct tenant/site", () => {
    expect(targets.length).toBeGreaterThanOrEqual(10);
    const nvidia = targets.find((t) => t.name === "NVIDIA Corporation");
    expect(nvidia).toMatchObject({
      host: "nvidia.wd5.myworkdayjobs.com",
      tenant: "nvidia",
      site: "NVIDIAExternalCareerSite",
    });
    expect(targets.some((t) => t.name.startsWith("Salesforce"))).toBe(true);
  });
  it("EXCLUDES vanity-domain Workday companies (tenant not derivable)", () => {
    expect(targets.some((t) => t.name.includes("Cisco"))).toBe(false); // jobs.cisco.com
    expect(targets.some((t) => t.name.includes("ServiceNow"))).toBe(false); // careers.servicenow.com
  });
});
