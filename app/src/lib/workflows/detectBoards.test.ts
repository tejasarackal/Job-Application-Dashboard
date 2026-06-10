import { describe, it, expect } from "vitest";
import { extractWorkdayToken } from "./boards/workday";
import { validBoardToken, siteFallbacks, workdayNeedsDetection } from "./detectBoards";
import type { ScrapeTarget } from "@/lib/types";

const target = (p: Partial<ScrapeTarget>): ScrapeTarget => ({ id: "rec1", company: "X", ...p });

describe("extractWorkdayToken", () => {
  it("reads tenant+site from the CXS API path (most reliable — vanity-domain pages call it)", () => {
    // What a careers.intuitive.com page's network calls reveal.
    expect(
      extractWorkdayToken('fetch("https://intuitive.wd1.myworkdayjobs.com/wday/cxs/intuitive/Intuitive/jobs")'),
    ).toEqual({ host: "intuitive.wd1.myworkdayjobs.com", tenant: "intuitive", site: "Intuitive" });
  });
  it("reads host+tenant+site from a direct myworkdayjobs careers URL", () => {
    expect(extractWorkdayToken("https://salesforce.wd12.myworkdayjobs.com/External_Career_Site")).toEqual({
      host: "salesforce.wd12.myworkdayjobs.com",
      tenant: "salesforce",
      site: "External_Career_Site",
    });
  });
  it("skips a locale segment (en-US/) before the site", () => {
    expect(extractWorkdayToken("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite")).toMatchObject({
      tenant: "nvidia",
      site: "NVIDIAExternalCareerSite",
    });
  });
  it("falls back to host+tenant (no site) when only the host appears", () => {
    expect(extractWorkdayToken("redirected to intuitive.wd1.myworkdayjobs.com")).toEqual({
      host: "intuitive.wd1.myworkdayjobs.com",
      tenant: "intuitive",
    });
  });
  it("returns null for a non-Workday / custom careers page", () => {
    expect(extractWorkdayToken("https://careers.intuitive.com")).toBeNull();
    expect(extractWorkdayToken(undefined)).toBeNull();
  });
});

describe("validBoardToken", () => {
  it("requires the full host|tenant|site triple", () => {
    expect(validBoardToken("salesforce.wd12.myworkdayjobs.com|salesforce|External_Career_Site")).toBe(true);
    expect(validBoardToken("host|tenant")).toBe(false);
    expect(validBoardToken("host|tenant|")).toBe(false); // empty site
    expect(validBoardToken("")).toBe(false);
    expect(validBoardToken(undefined)).toBe(false);
  });
});

describe("siteFallbacks", () => {
  it("tries the common external-site slug first and includes tenant-cased variants", () => {
    const sites = siteFallbacks("nvidia");
    expect(sites[0]).toBe("External_Career_Site");
    expect(sites).toContain("ExternalCareersPage"); // the Salesforce-class wrong site
    expect(sites).toContain("NvidiaExternalCareerSite");
  });
});

describe("workdayNeedsDetection", () => {
  it("flags Workday targets that aren't yet confirmed working", () => {
    expect(workdayNeedsDetection(target({ ats: "workday", coverageStatus: "needs_detection" }))).toBe(true);
    expect(workdayNeedsDetection(target({ ats: "workday", coverageStatus: undefined }))).toBe(true);
  });
  it("leaves terminal statuses alone (loop-safety: processed → detected/undetectable → drops out)", () => {
    expect(workdayNeedsDetection(target({ ats: "workday", coverageStatus: "detected" }))).toBe(false);
    expect(workdayNeedsDetection(target({ ats: "workday", coverageStatus: "undetectable" }))).toBe(false);
  });
  it("ignores non-Workday targets (Greenhouse/Lever tokens come from the registry)", () => {
    expect(workdayNeedsDetection(target({ ats: "greenhouse", coverageStatus: "needs_detection" }))).toBe(false);
  });
});
