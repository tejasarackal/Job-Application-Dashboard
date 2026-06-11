// revalidateListings — free, native-only liveness sweep. Re-checks every ACTIVE
// (pre-apply) Job_Listings row against its board's CURRENT open set and expires the
// ones whose posting has closed, so dead links drop out of the New section. No
// Apify, no LLM — it reuses the scrape's board adapters + the pure `buildExpiries`.
//
// Why this exists: board APIs list only OPEN roles, and postings close between
// scrape and click, so listings go stale. `buildExpiries` only ran inside the daily
// `scrapeJobs`; this workflow runs the same expiry pass on demand AND a 2nd time/day
// in the `pipeline` cron — at zero Apify cost. Scoped to companies that actually
// have an active listing, so it fetches the minimum set of boards (cron-budget-safe).
import { normalizeCompany } from "./filters";
import { fetchBoardJobs } from "./boards";
import { listJobListings, listScrapeTargets, updateRecords, TABLES, primaryBase } from "@/lib/airtable";
import { buildExpiries, nativeOk, mapLimit, WORKDAY_CONCURRENCY } from "./scrapeJobs";
import type { RunResult } from "./runLog";
import type { JobListing, ScrapeTarget } from "@/lib/types";

// Pre-apply statuses = "still in New's orbit"; only these are expiry candidates.
const PRE_APPLY = new Set(["new", "queued", "approved", "review_pending"]);

// Pure: the native boards worth re-fetching = those whose company has at least one
// ACTIVE (pre-apply) listing. Keeps the sweep to the minimum board set. Exported for tests.
export function selectRevalidationTargets(existing: JobListing[], targets: ScrapeTarget[]): ScrapeTarget[] {
  const wanted = new Set(
    existing.filter((l) => l.status && PRE_APPLY.has(l.status)).map((l) => normalizeCompany(l.company)),
  );
  return targets.filter((t) => nativeOk(t) && wanted.has(normalizeCompany(t.company)));
}

export async function revalidateListings(
  opts: { ownerEmail: string; dryRun?: boolean; deadlineMs?: number },
): Promise<RunResult> {
  const dryRun = Boolean(opts.dryRun);
  const deadline = Date.now() + (opts.deadlineMs ?? 25_000); // stays well under the cron budget

  // Owner-scoped read (engine identity — PRD §5.6).
  const existing = await listJobListings(opts.ownerEmail, { fresh: true });
  const active = existing.filter((l) => l.status && PRE_APPLY.has(l.status));
  if (!active.length) {
    return { counts: { companies: 0, checked: 0, expired: 0 }, partial: false, notes: "no active listings to revalidate" };
  }

  const targets = selectRevalidationTargets(existing, await listScrapeTargets({ fresh: true }));

  // Fetch each company's current open set (Workday capped; cheap GET boards parallel).
  const fetchOne = async (t: ScrapeTarget) => ({
    t,
    jobs: await fetchBoardJobs({ company: t.company, ats: t.ats, boardToken: t.boardToken }, { deadlineMs: deadline }),
  });
  const wd = targets.filter((t) => t.ats === "workday");
  const fast = targets.filter((t) => t.ats !== "workday");
  const [fastResults, wdResults] = await Promise.all([
    Promise.all(fast.map(fetchOne)),
    mapLimit(wd, WORKDAY_CONCURRENCY, fetchOne),
  ]);
  const nativeResults = [...fastResults, ...wdResults];

  // Same pure expiry rule as the scrape: a pre-apply row absent from its board's
  // healthy, non-empty open set is closed → expired (LinkedIn/Other aged out at 30d).
  const updates = buildExpiries(existing, nativeResults);
  if (!dryRun && updates.length) await updateRecords(TABLES.jobListings, primaryBase(), updates);

  // A board that returned nothing this run (timeout/none) is untrusted — surface it.
  const emptyBoards = nativeResults.filter((r) => !r.jobs.length).map((r) => r.t.company);

  return {
    counts: { companies: targets.length, checked: active.length, expired: updates.length },
    partial: false,
    notes:
      `${dryRun ? "[DRY RUN] " : ""}revalidated ${targets.length} boards · ${active.length} active listings · expired ${updates.length}` +
      (emptyBoards.length ? `; no-result boards (skipped, not expired): ${emptyBoards.slice(0, 20).join(", ")}` : ""),
  };
}
