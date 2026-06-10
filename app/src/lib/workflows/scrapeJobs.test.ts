import { describe, it, expect } from "vitest";
import { buildExpiries } from "./scrapeJobs";
import type { JobListing, ScrapeTarget } from "@/lib/types";
import type { RawJob } from "./boards";

let n = 0;
const lst = (o: Partial<JobListing>): JobListing => ({
  id: `rec${(n++).toString().padStart(14, "0")}`,
  title: "Senior Data Engineer",
  company: "Acme",
  ...o,
});
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
const gh = (org: string, id: string) => `https://job-boards.greenhouse.io/${org}/jobs/${id}`;
const native = (company: string, ats: string, jobs: RawJob[]) => ({
  t: { id: `t-${company}`, company, ats } as ScrapeTarget,
  jobs,
});

describe("buildExpiries", () => {
  it("expires a native row absent from its board's healthy open set, keeps present ones", () => {
    const existing = [
      lst({ id: "rOpen", company: "ClickHouse", board: "Greenhouse", status: "new", url: gh("clickhouse", "111") }),
      lst({ id: "rGone", company: "ClickHouse", board: "Greenhouse", status: "new", url: gh("clickhouse", "999") }),
    ];
    const jobs: RawJob[] = [{ title: "x", company: "ClickHouse", url: gh("clickhouse", "111") }];
    const out = buildExpiries(existing, [native("ClickHouse", "greenhouse", jobs)]);
    expect(out.map((u) => u.id)).toEqual(["rGone"]);
  });

  it("never expires on an empty/failed fetch (no trustworthy open set)", () => {
    const existing = [lst({ id: "r1", company: "ClickHouse", board: "Greenhouse", status: "new", url: gh("clickhouse", "111") })];
    expect(buildExpiries(existing, [native("ClickHouse", "greenhouse", [])])).toEqual([]);
  });

  it("never expires already-actioned (applied/skipped) rows", () => {
    const existing = [
      lst({ id: "rApplied", company: "ClickHouse", board: "Greenhouse", status: "applied", url: gh("clickhouse", "999") }),
      lst({ id: "rSkipped", company: "ClickHouse", board: "Greenhouse", status: "skipped", url: gh("clickhouse", "998") }),
    ];
    const jobs: RawJob[] = [{ title: "x", company: "ClickHouse", url: gh("clickhouse", "111") }];
    expect(buildExpiries(existing, [native("ClickHouse", "greenhouse", jobs)])).toEqual([]);
  });

  it("ages out stale LinkedIn rows but not fresh ones, and a native open set never expires them", () => {
    const existing = [
      lst({ id: "rStale", company: "ClickHouse", board: "LinkedIn", status: "new", url: "https://www.linkedin.com/jobs/view/4400000001", scrapedAt: daysAgo(40) }),
      lst({ id: "rFresh", company: "ClickHouse", board: "LinkedIn", status: "new", url: "https://www.linkedin.com/jobs/view/4400000002", scrapedAt: daysAgo(5) }),
    ];
    // A Greenhouse open set for the SAME company must not touch the LinkedIn rows.
    const jobs: RawJob[] = [{ title: "x", company: "ClickHouse", url: gh("clickhouse", "111") }];
    expect(buildExpiries(existing, [native("ClickHouse", "greenhouse", jobs)]).map((u) => u.id)).toEqual(["rStale"]);
  });
});
