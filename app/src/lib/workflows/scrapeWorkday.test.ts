import { describe, it, expect } from "vitest";
import { parseWorkdayPosted, workdayLocation } from "./boards/workday";
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
