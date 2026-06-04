import { describe, it, expect } from "vitest";
import { parseGreenhouse } from "./greenhouse";
import { parseLever } from "./lever";
import { parseAshby } from "./ashby";

describe("parseGreenhouse", () => {
  it("maps boards-api jobs to RawJob (title/company/url/location/postedAt)", () => {
    const out = parseGreenhouse(
      {
        jobs: [
          { title: "Senior Data Engineer", absolute_url: "https://boards.greenhouse.io/acme/jobs/123", updated_at: "2026-06-01T00:00:00Z", location: { name: "San Francisco, CA" } },
          { title: "Data Engineer, People Analytics", absolute_url: "https://boards.greenhouse.io/acme/jobs/124", updated_at: "2026-06-02T00:00:00Z", location: { name: "Remote - US" } },
        ],
      },
      "Acme Inc.",
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      title: "Senior Data Engineer",
      company: "Acme Inc.",
      url: "https://boards.greenhouse.io/acme/jobs/123",
      location: "San Francisco, CA",
      postedAt: "2026-06-01T00:00:00Z",
    });
  });
  it("drops jobs missing title/url and tolerates empty/null", () => {
    expect(parseGreenhouse(null, "X")).toEqual([]);
    expect(parseGreenhouse({ jobs: [{ title: "DE" }] }, "X")).toEqual([]); // no url
  });
});

describe("parseLever", () => {
  it("maps postings + converts epoch createdAt to ISO + remote flag", () => {
    const out = parseLever(
      [{ text: "Analytics Engineer", hostedUrl: "https://jobs.lever.co/plaid/uuid-1", createdAt: 1717200000000, workplaceType: "remote", categories: { location: "San Francisco" } }],
      "Plaid Inc.",
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Analytics Engineer");
    expect(out[0].location).toBe("San Francisco");
    expect(out[0].remote).toBe(true);
    expect(out[0].postedAt).toBe(new Date(1717200000000).toISOString());
  });
  it("tolerates non-array", () => {
    expect(parseLever(null, "X")).toEqual([]);
  });
});

describe("parseAshby", () => {
  it("returns Notion's DE role and filters unlisted postings (the bug we're fixing)", () => {
    const out = parseAshby(
      {
        jobs: [
          { title: "Data Engineer, People Analytics", jobUrl: "https://jobs.ashbyhq.com/notion/a1216dba", publishedAt: "2026-05-31T00:00:00Z", location: "Remote", isRemote: true, isListed: true },
          { title: "Outbound BDR", jobUrl: "https://jobs.ashbyhq.com/notion/x", isListed: false },
        ],
      },
      "Notion Labs Inc.",
    );
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Data Engineer, People Analytics");
    expect(out[0].company).toBe("Notion Labs Inc.");
    expect(out[0].remote).toBe(true);
  });
  it("joins secondary locations", () => {
    const out = parseAshby(
      { jobs: [{ title: "DE", jobUrl: "https://jobs.ashbyhq.com/x/1", location: "San Francisco", secondaryLocations: [{ location: "Remote" }] }] },
      "X",
    );
    expect(out[0].location).toBe("San Francisco, Remote");
  });
});
