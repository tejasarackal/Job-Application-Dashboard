import { describe, it, expect } from "vitest";
import { buildExpiries, collectRows, type CollectCtx } from "./scrapeJobs";
import { FIELDS } from "@/lib/airtable";
import { OWNER_PREFS, type ScoringPrefs } from "./filters";
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

// ── Integration: collectRows per-user gates (Phase 4 — the reported bug) ───────
// collectRows is pure (mutates ctx, no I/O). Feeding one mixed batch with
// different ScoringPrefs proves the title/location gates follow the ACTOR, not
// the owner's hardcoded DE/Bay-Area criteria — and that owner behavior is intact.
const ghUrl = (id: string) => `https://job-boards.greenhouse.io/acme/jobs/${id}`;
const recent = new Date().toISOString().slice(0, 10);

function mkCtx(scoringPrefs: ScoringPrefs): CollectCtx {
  return {
    totals: {},
    keys: new Set(),
    seen: new Set(),
    actionedRoles: new Set(),
    toCreate: [],
    windowDays: 60,
    sponsors: new Set(["acme"]),
    scoringPrefs,
    samples: { title: [], loc: [], stale: [] },
  };
}

// A mixed batch: a DE role, a TPM role, an intern, and a foreign-only role.
const mixed: Record<string, unknown>[] = [
  { title: "Senior Data Engineer", company: "Acme", location: "San Jose, CA", url: ghUrl("1"), postedAt: recent },
  { title: "Senior Technical Program Manager", company: "Acme", location: "San Jose, CA", url: ghUrl("2"), postedAt: recent },
  { title: "Program Manager Intern", company: "Acme", location: "San Jose, CA", url: ghUrl("3"), postedAt: recent },
  { title: "Program Manager", company: "Acme", location: "Bangalore, India", url: ghUrl("4"), postedAt: recent },
];
const keptTitles = (ctx: CollectCtx) => ctx.toCreate.map((r) => r[FIELDS.jobListings.title]);

describe("collectRows per-user gates (Phase 4)", () => {
  it("OWNER keeps DE, drops the TPM role (parity)", () => {
    const ctx = mkCtx(OWNER_PREFS);
    collectRows(mixed, "Greenhouse", ctx, true);
    expect(keptTitles(ctx)).toEqual(["Senior Data Engineer"]);
  });

  it("TPM MEMBER keeps the PM role, drops DE + intern (the reported bug, fixed)", () => {
    const tpm: ScoringPrefs = {
      titleKeywords: ["technical program manager", "program manager"],
      locations: [], // neutral → location-agnostic
      disqualifiedMetros: [],
      remotePref: "no_preference",
    };
    const ctx = mkCtx(tpm);
    collectRows(mixed, "Greenhouse", ctx, true);
    const kept = keptTitles(ctx);
    expect(kept).toContain("Senior Technical Program Manager");
    expect(kept).toContain("Program Manager"); // neutral location accepts Bangalore
    expect(kept).not.toContain("Senior Data Engineer");
    expect(kept).not.toContain("Program Manager Intern"); // FTE rule for everyone
  });

  it("a Bay-Area-only TPM member drops the foreign-only PM role via the location gate", () => {
    const bayTpm: ScoringPrefs = {
      titleKeywords: ["program manager"],
      locations: ["san jose", "san francisco"],
      disqualifiedMetros: [],
      remotePref: "no_preference",
    };
    const ctx = mkCtx(bayTpm);
    collectRows(mixed, "Greenhouse", ctx, true);
    const kept = keptTitles(ctx);
    expect(kept).toContain("Senior Technical Program Manager"); // San Jose
    expect(kept).not.toContain("Program Manager"); // Bangalore → dropped by location
    expect(kept).not.toContain("Senior Data Engineer"); // not their role
  });
});
