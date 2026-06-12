// A1 — Job scraping → Job_Listings, driven by the Scrape_Targets mart.
// For each target company we call its NATIVE public board API (Greenhouse / Lever
// / Ashby / Workday) directly — deterministic, complete, no Apify — and companies
// with no resolved board fall back to ONE Apify LinkedIn f_C search over their
// LinkedIn IDs. All sources feed the unchanged collectRows() filter/dedup/match
// pass. Runs in one invocation within a ~48s budget (board GETs are fast +
// parallel); the freshness window is 45d because board APIs return only OPEN roles.
import { isH1bSponsor, checkLocation, titleMatches, canonicalJobKey, canonicalUrl, roleKey, matchScore, normalizeCompany, type ScoringPrefs } from "./filters";
import { getUserPrefs } from "@/lib/prefs";
import { scoringPrefsFor } from "@/lib/scoring";
import { fetchBoardJobs, BOARD_LABEL, type RawJob } from "./boards";
import { linkedinKeywordQuery, searchKeywordsFor, linkedinLocationFor } from "./boards/keywords";
import {
  listJobListings,
  listScrapeTargets,
  createRecords,
  updateRecords,
  createWorkflowRun,
  updateWorkflowRun,
  withOwner,
  TABLES,
  FIELDS,
  primaryBase,
} from "@/lib/airtable";
import type { RunResult } from "./runLog";
import type { JobListing, ScrapeTarget, WorkflowTrigger } from "@/lib/types";

const APIFY = "https://api.apify.com/v2";
const LINKEDIN_ACTOR = process.env.APIFY_LINKEDIN_ACTOR_ID || "hKByXkMQaC5Qt9UMN";

// Board APIs list only currently-OPEN roles, so a tight window would hide still-
// hireable postings. 45d = "recently posted" without dropping active listings.
const SCRAPE_WINDOW_DAYS = 45;
const LI_COUNT = 75; // broader OR keyword query returns more candidates/company
// Cap simultaneous Workday boards: each now paginates per keyword (many POSTs), so
// uncapped parallelism across ~30+ tenants could exhaust the ~48s budget. Cheap
// single-GET boards (Greenhouse/Lever/Ashby) stay fully parallel.
export const WORKDAY_CONCURRENCY = 8;

const NATIVE_ATS = new Set(["greenhouse", "lever", "ashby", "workday"]);
// A target is natively scrapable iff it has a verified ATS + board token.
export function nativeOk(t: ScrapeTarget): boolean {
  return Boolean(t.boardToken && t.ats && NATIVE_ATS.has(t.ats));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── LinkedIn f_C fallback (Apify) — only for targets with no native board ──────
// keywords is an OR-expression over the ACTOR's search keywords (the owner's are
// the data-engineering set) so adjacent roles surface in the ONE run; location
// is the actor's (owner → Bay Area; member → their location; neutral → US).
function linkedinSearchUrl(
  ids: string[],
  keywords: string = linkedinKeywordQuery(),
  location = "San Francisco Bay Area",
): string {
  const base = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}&f_TPR=r${SCRAPE_WINDOW_DAYS * 86_400}`;
  if (!ids.length) return base;
  try {
    const u = new URL(base);
    u.searchParams.set("f_C", ids.join(","));
    return u.toString();
  } catch {
    return base;
  }
}

// Bounded-concurrency map — runs at most `limit` of `fn` at once, preserving order.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchLinkedinFallback(
  ids: string[],
  token: string | undefined,
  deadline: number,
  totals: Record<string, number>,
  search: { keywords: string; location: string } = { keywords: linkedinKeywordQuery(), location: "San Francisco Bay Area" },
): Promise<RawJob[]> {
  if (!token || !ids.length) return [];
  const input = { urls: [linkedinSearchUrl(ids, search.keywords, search.location)], count: LI_COUNT, scrapeCompany: false };
  try {
    const res = await fetch(`${APIFY}/acts/${LINKEDIN_ACTOR}/runs?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) { bump(totals, "sourceErrors"); return []; }
    const run = (await res.json()).data as { id: string; defaultDatasetId: string };
    while (Date.now() < deadline) {
      try {
        const st = await fetch(`${APIFY}/actor-runs/${run.id}?token=${token}`);
        const rd = (await st.json()).data as { status: string; defaultDatasetId: string };
        if (rd.status === "SUCCEEDED") {
          const dsId = run.defaultDatasetId || rd.defaultDatasetId;
          const items = (await (await fetch(`${APIFY}/datasets/${dsId}/items?clean=true&limit=200&token=${token}`)).json()) as unknown;
          return Array.isArray(items) ? (items as RawJob[]) : [];
        }
        if (rd.status !== "RUNNING" && rd.status !== "READY") { bump(totals, "sourceErrors"); return []; }
      } catch {
        // transient — keep polling to the deadline
      }
      await sleep(2000);
    }
    bump(totals, "timedOut");
    return [];
  } catch {
    bump(totals, "sourceErrors");
    return [];
  }
}

// Diagnostic for {check:true} — shows the resolved target mix without scraping.
export async function describeInputs() {
  const targets = await listScrapeTargets();
  const byAts: Record<string, number> = {};
  for (const t of targets) byAts[t.ats ?? "none"] = (byAts[t.ats ?? "none"] ?? 0) + 1;
  const native = targets.filter(nativeOk);
  const fallback = targets.filter((t) => !nativeOk(t) && t.linkedinId);
  return {
    totalTargets: targets.length,
    byAts,
    nativeBoards: native.length,
    linkedinFallback: fallback.length,
    windowDays: SCRAPE_WINDOW_DAYS,
    sample: native.slice(0, 8).map((t) => ({ company: t.company, ats: t.ats, token: t.boardToken })),
  };
}

// ── normalization (actor/board outputs are inconsistently shaped) ─────────────
type Raw = Record<string, unknown>;

function str(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return str(o.name ?? o.text ?? o.label ?? o.title ?? o.value ?? "");
  }
  return "";
}
function pick(it: Raw, ...keys: string[]): string {
  for (const k of keys) {
    const s = str(it[k]);
    if (s) return s;
  }
  return "";
}
function normalize(it: Raw) {
  const title = pick(it, "title", "positionName", "jobTitle", "position");
  const company = pick(it, "company", "companyName", "company_name", "employer");
  const url = pick(it, "url", "jobUrl", "link", "applyUrl", "absolute_url");
  const location = pick(it, "location", "jobLocation", "locationName", "locations");
  const remote = Boolean(it.remote) || /remote/i.test(location);
  const postedAt = pick(
    it, "postedAt", "postedTime", "listedAt", "datePosted", "posted_at", "postedDate", "postedDateTime", "publishedAt", "updated_at", "created_at",
  );
  const rawScore = it.score ?? it.relevanceScore ?? it.matchScore ?? it.match;
  const n = typeof rawScore === "number" ? rawScore : Number(rawScore);
  const actorScore = Number.isFinite(n) ? (n > 1 ? n / 100 : n) : undefined;
  return { title, company, url, location, remote, postedAt, actorScore };
}

function bump(t: Record<string, number>, k: string, n = 1) {
  t[k] = (t[k] ?? 0) + n;
}

export interface CollectCtx {
  totals: Record<string, number>;
  keys: Set<string>;
  seen: Set<string>;
  // roleKey()s of listings the user has already triaged/actioned — a fresh variant
  // of one of these (same company+title, different posting) is NOT re-added as new.
  actionedRoles: Set<string>;
  toCreate: Array<Record<string, unknown>>;
  windowDays?: number;
  sponsors: Set<string>; // normalized names of all Scrape_Targets (H1B sponsors)
  scoringPrefs: ScoringPrefs; // the actor's prefs — owner gets OWNER_PREFS
  samples: { title: string[]; loc: string[]; stale: string[] };
}

// Listing statuses that mean "the user has already acted on this role" — used to
// suppress resurrecting it (B1) and to protect it from auto-expiry.
const ACTIONED_STATUSES = new Set(["applied", "skipped", "queued", "approved", "review_pending", "expired"]);

const SAMPLE_CAP = 12;
function sample(arr: string[], v: string): void {
  if (v && arr.length < SAMPLE_CAP) arr.push(v);
}

// `trusted` = the batch came from a known H1B target's own board, so the H1B gate
// is satisfied by construction (skip it). LinkedIn fallback is untrusted → verify
// the returned company is a known sponsor.
export function collectRows(items: Raw[], sourceBoard: string, ctx: CollectCtx, trusted: boolean): void {
  for (const raw of items) {
    bump(ctx.totals, "scraped");
    try {
      const it = normalize(raw);
      if (!trusted && !(ctx.sponsors.has(normalizeCompany(it.company)) || isH1bSponsor(it.company))) {
        bump(ctx.totals, "droppedH1b");
        continue;
      }
      // Per-user gates (Phase 4): keep titles matching the ACTOR's keywords
      // (owner → DE regex) and locations matching the ACTOR's prefs — not the
      // owner's hardcoded DE/Bay-Area defaults.
      if (!titleMatches(it.title, ctx.scoringPrefs)) { bump(ctx.totals, "droppedTitle"); sample(ctx.samples.title, it.title); continue; }
      if (!checkLocation(it.location, ctx.scoringPrefs).pass) { bump(ctx.totals, "droppedLoc"); sample(ctx.samples.loc, it.location); continue; }
      if (it.postedAt && ctx.windowDays) {
        const t = Date.parse(it.postedAt);
        if (!Number.isNaN(t) && Date.now() - t > ctx.windowDays * 86_400_000) {
          bump(ctx.totals, "droppedStale");
          sample(ctx.samples.stale, `${it.title} @ ${it.postedAt}`);
          continue;
        }
      }

      const ck = canonicalJobKey(it.url);
      if (!ck.key || ctx.keys.has(ck.key) || ctx.seen.has(ck.key)) { bump(ctx.totals, "dupes"); continue; }
      ctx.seen.add(ck.key);

      // Don't resurrect a role the user already actioned (applied/skipped/triaged):
      // the same role often re-appears as a different posting (other board / new
      // req id) with a fresh canonical key, which is the "applied → back in New" bug.
      if (ctx.actionedRoles.has(roleKey(it.company, it.title))) { bump(ctx.totals, "suppressedRole"); continue; }

      const board = ck.board !== "Other" ? ck.board : sourceBoard;
      const pct = matchScore({ title: it.title, location: it.location, remote: it.remote, postedAt: it.postedAt, actorScore: it.actorScore }, ctx.scoringPrefs);

      const row: Record<string, unknown> = {
        [FIELDS.jobListings.title]: it.title,
        [FIELDS.jobListings.company]: it.company,
        [FIELDS.jobListings.url]: canonicalUrl(it.url),
        [FIELDS.jobListings.board]: board,
        [FIELDS.jobListings.location]: it.location,
        [FIELDS.jobListings.remote]: it.remote,
        [FIELDS.jobListings.status]: "new",
        [FIELDS.jobListings.scrapedAt]: new Date().toISOString().slice(0, 10),
        [FIELDS.jobListings.h1bVerified]: true,
        [FIELDS.jobListings.matchPct]: pct / 100,
      };
      if (it.postedAt) {
        const t = Date.parse(it.postedAt);
        if (!Number.isNaN(t)) row[FIELDS.jobListings.postedAt] = new Date(t).toISOString().slice(0, 10);
      }
      ctx.toCreate.push(row);
      bump(ctx.totals, "created");
    } catch {
      bump(ctx.totals, "droppedError");
    }
  }
}

// Statuses still "in New's orbit" that an expiry may move to "expired". Actioned
// states (applied/skipped/expired) are left untouched.
const EXPIRABLE_STATUSES = new Set(["new", "queued", "approved", "review_pending"]);
const LINKEDIN_STALE_DAYS = 30; // age-out for LinkedIn/Other rows (no open-set signal)

// Pure: compute the {id, status:"expired"} updates for closed/stale listings.
// Native rows are expired by absence from their board's fresh OPEN set (company +
// board scoped, healthy fetches only); LinkedIn/Other rows by age. Exported for tests.
export function buildExpiries(
  existing: JobListing[],
  nativeResults: Array<{ t: ScrapeTarget; jobs: RawJob[] }>,
): Array<{ id: string; fields: Record<string, unknown> }> {
  // Open canonical keys per "normalizedCompany::Board" — only from non-empty fetches
  // (an empty/failed fetch is untrustworthy, so we never expire against it).
  const openByCompanyBoard = new Map<string, Set<string>>();
  for (const { t, jobs } of nativeResults) {
    if (!jobs.length) continue;
    const cbKey = `${normalizeCompany(t.company)}::${BOARD_LABEL[t.ats ?? ""] ?? "Other"}`;
    let set = openByCompanyBoard.get(cbKey);
    if (!set) { set = new Set<string>(); openByCompanyBoard.set(cbKey, set); }
    for (const j of jobs) {
      const k = canonicalJobKey(j.url).key;
      if (k) set.add(k);
    }
  }

  const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
  for (const l of existing) {
    if (!l.status || !EXPIRABLE_STATUSES.has(l.status)) continue;
    const board = l.board ?? "Other";
    const openSet = openByCompanyBoard.get(`${normalizeCompany(l.company)}::${board}`);
    if (openSet) {
      // Authoritative open set for this company+board: absent ⇒ closed.
      const liveKey = canonicalJobKey(l.url).key;
      if (liveKey && !openSet.has(liveKey)) {
        updates.push({ id: l.id, fields: { [FIELDS.jobListings.status]: "expired" } });
      }
    } else if (board === "LinkedIn" || board === "Other") {
      // No open set to compare against — age the row out instead.
      const t = l.scrapedAt ? Date.parse(l.scrapedAt) : NaN;
      if (!Number.isNaN(t) && (Date.now() - t) / 86_400_000 > LINKEDIN_STALE_DAYS) {
        updates.push({ id: l.id, fields: { [FIELDS.jobListings.status]: "expired" } });
      }
    }
  }
  return updates;
}

export async function scrapeJobs(opts: {
  ownerEmail: string; // ACTOR identity — all listing rows + the run row are stamped to it
  dryRun?: boolean;
  windowDays?: number;
  trigger?: WorkflowTrigger;
  deadlineMs?: number;
  // Per-user scoping (Phase 3): when provided, the mart is filtered to these
  // normalized company keys (the actor's effective targets). null/undefined =
  // owner/cron → scrape the whole mart (legacy behavior, unchanged).
  targetKeys?: Set<string> | null;
}): Promise<RunResult> {
  const ownerEmail = opts.ownerEmail;
  const dryRun = Boolean(opts.dryRun);
  const windowDays = opts.windowDays ?? SCRAPE_WINDOW_DAYS;
  const deadline = Date.now() + (opts.deadlineMs ?? 48_000);
  const totals: Record<string, number> = {};
  // Score against the ACTOR's prefs (owner → OWNER_PREFS, byte-for-byte legacy).
  const scoringPrefs = scoringPrefsFor(ownerEmail, await getUserPrefs(ownerEmail));
  // Source-search terms for the keyword-driven scrapers (Workday CXS, LinkedIn):
  // the ACTOR's roles, not the owner's set (the helper maps the owner to the
  // data-engineering keywords; a member to their own titleKeywords).
  const searchKeywords = searchKeywordsFor(scoringPrefs);
  const liSearch = { keywords: linkedinKeywordQuery(searchKeywords), location: linkedinLocationFor(scoringPrefs) };
  const logRunId = await createWorkflowRun({ workflow: "scrape_jobs", trigger: opts.trigger ?? "manual", ownerEmail });

  try {
    const allTargets = await listScrapeTargets({ fresh: true });
    // Per-user: keep only the actor's effective target companies. Owner/cron
    // (targetKeys null) scrape the full mart.
    const targets = opts.targetKeys
      ? allTargets.filter((t) => opts.targetKeys!.has(normalizeCompany(t.company)))
      : allTargets;
    const sponsors = new Set(targets.map((t) => normalizeCompany(t.company)));
    const native = targets.filter(nativeOk);
    const fallbackIds = targets.filter((t) => !nativeOk(t) && t.linkedinId).map((t) => t.linkedinId as string);

    // Start LinkedIn fallback (Apify) + native board fetches concurrently. Workday
    // boards paginate per keyword (many POSTs each), so cap their concurrency; the
    // cheap single-GET boards (Greenhouse/Lever/Ashby) stay fully parallel.
    const fetchOne = async (t: ScrapeTarget) => ({
      t,
      jobs: await fetchBoardJobs(
        { company: t.company, ats: t.ats, boardToken: t.boardToken },
        { deadlineMs: deadline, keywords: searchKeywords },
      ),
    });
    const wdTargets = native.filter((t) => t.ats === "workday");
    const fastTargets = native.filter((t) => t.ats !== "workday");
    const liPromise = fetchLinkedinFallback(fallbackIds, process.env.APIFY_TOKEN, deadline, totals, liSearch);
    const fastPromise = Promise.all(fastTargets.map(fetchOne));
    const wdPromise = mapLimit(wdTargets, WORKDAY_CONCURRENCY, fetchOne);
    const [fastResults, wdResults, liItems] = await Promise.all([fastPromise, wdPromise, liPromise]);
    const nativeResults = [...fastResults, ...wdResults];

    const existing = await listJobListings(ownerEmail, { fresh: true });
    const ctx: CollectCtx = {
      totals,
      keys: new Set(existing.map((l) => canonicalJobKey(l.url).key).filter(Boolean)),
      seen: new Set<string>(),
      actionedRoles: new Set(
        existing.filter((l) => l.status && ACTIONED_STATUSES.has(l.status)).map((l) => roleKey(l.company, l.title)),
      ),
      toCreate: [],
      windowDays,
      sponsors,
      scoringPrefs,
      samples: { title: [], loc: [], stale: [] },
    };

    // Board jobs are trusted (came from a known sponsor's own board). Track per-
    // board fetched/kept so we can write coverage back per company and surface the
    // "fetched-but-kept-0" case — the wrong-site/token signature an all-or-nothing
    // zeroBoards check misses.
    const zeroBoards: string[] = [];
    const keptZeroBoards: string[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const targetUpdates: Array<{ id: string; fields: Record<string, unknown> }> = [];
    for (const { t, jobs } of nativeResults) {
      bump(totals, `got_${t.ats}`, jobs.length);
      const before = ctx.toCreate.length;
      collectRows(jobs as unknown as Raw[], BOARD_LABEL[t.ats ?? ""] ?? "Other", ctx, true);
      const kept = ctx.toCreate.length - before;
      if (jobs.length === 0) zeroBoards.push(t.company);
      else if (kept === 0) keptZeroBoards.push(t.company);
      if (t.id) {
        const fields: Record<string, unknown> = {
          [FIELDS.scrapeTargets.lastScraped]: today,
          [FIELDS.scrapeTargets.lastJobCount]: jobs.length,
        };
        // Regression self-heal: a Workday board that USED to return jobs but now
        // returns none = a dead/changed token (the Salesforce wrong-site class) →
        // re-queue it for detect_boards to re-resolve. (A consistently-empty board
        // had lastJobCount 0 already, so it isn't re-flagged — no oscillation.)
        if (t.ats === "workday" && jobs.length === 0 && t.coverageStatus === "detected" && (t.lastJobCount ?? 0) > 0) {
          fields[FIELDS.scrapeTargets.coverageStatus] = "needs_detection";
        }
        targetUpdates.push({ id: t.id, fields });
      }
    }
    // LinkedIn fallback is untrusted — verify each company is a known sponsor.
    bump(totals, "got_LinkedIn", liItems.length);
    collectRows(liItems as unknown as Raw[], "LinkedIn", ctx, false);

    // ── Expire listings whose posting is no longer open ───────────────────────
    // A native board returns only currently-OPEN roles, so a previously-scraped row
    // absent from a SUCCESSFUL, non-empty fetch of its own board is closed → expire
    // it so its dead link drops out of New. Scoped by company AND board, pre-apply
    // only; a transient/zero fetch yields no open set, so nothing is expired on it.
    // LinkedIn/Other come from a keyword search (not a complete per-company set), so
    // absence ≠ closed — age those out instead.
    const listingUpdates = buildExpiries(existing, nativeResults);
    bump(totals, "expired", listingUpdates.length);

    // Every engine create is owner-stamped server-side (PRD §5.6 / G7).
    if (!dryRun && ctx.toCreate.length) {
      await createRecords(
        TABLES.jobListings,
        primaryBase(),
        ctx.toCreate.map((row) => withOwner("jobListings", row, ownerEmail)),
      );
    }
    if (!dryRun && listingUpdates.length) await updateRecords(TABLES.jobListings, primaryBase(), listingUpdates);
    if (!dryRun && targetUpdates.length) await updateRecords(TABLES.scrapeTargets, primaryBase(), targetUpdates);

    const incomplete = (totals.timedOut ?? 0) > 0 || (totals.sourceErrors ?? 0) > 0;
    const summary = summarize(totals);
    const coverage = `coverage: ${native.length - zeroBoards.length}/${native.length} boards returned jobs + ${fallbackIds.length} via LinkedIn` +
      (zeroBoards.length ? `; 0-job boards (check token): ${zeroBoards.slice(0, 20).join(", ")}` : "") +
      (keptZeroBoards.length ? `; fetched-but-kept-0 (check site/title/loc): ${keptZeroBoards.slice(0, 20).join(", ")}` : "");
    const diag = diagnostics(ctx.samples);
    const notes = [summary, coverage, diag].filter(Boolean).join("\n\n");
    await updateWorkflowRun(logRunId, { status: incomplete ? "partial" : "success", counts: totals, notes, finished: true });
    return { counts: totals, partial: false, notes: dryRun ? notes : `${summary}\n\n${coverage}` };
  } catch (e) {
    await updateWorkflowRun(logRunId, { status: "failed", notes: (e as Error).message, finished: true }).catch(() => {});
    return { counts: totals, partial: false, notes: `error: ${(e as Error).message}` };
  }
}

function summarize(t: Record<string, number>): string {
  return `scraped ${t.scraped ?? 0}, added ${t.created ?? 0}, dupes ${t.dupes ?? 0}, suppressed-role ${t.suppressedRole ?? 0}, expired ${t.expired ?? 0}; dropped h1b:${t.droppedH1b ?? 0} title:${t.droppedTitle ?? 0} loc:${t.droppedLoc ?? 0} stale:${t.droppedStale ?? 0}`;
}

function diagnostics(s: { title: string[]; loc: string[]; stale: string[] }): string {
  const parts: string[] = [];
  if (s.title.length) parts.push(`dropped-title e.g.: ${s.title.join(" | ")}`);
  if (s.loc.length) parts.push(`dropped-loc e.g.: ${s.loc.join(" | ")}`);
  if (s.stale.length) parts.push(`dropped-stale e.g.: ${s.stale.join(" | ")}`);
  return parts.join("\n");
}
