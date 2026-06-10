# PRD — Scrape Coverage: stop missing high-value DE jobs

**Status:** Stages 1–4 implemented (2026-06-04); Stage 5 specced (conditional).
**Owner:** Tejas Arackal · **Related:** `PRD-workflow-engine.md` §5.A1, `IMPLEMENTATION-workflow-engine.md`

---

## 1. Problem

The `scrape_jobs` workflow silently drops high-value Bay-Area Data-Engineer roles. Four concrete
misses triggered this PRD:

| # | Job | Company / source |
|---|-----|------------------|
| 1 | Sr. Data Engineer, Enterprise — Slack | **Salesforce** · Workday `salesforce.wd12…`, site `External_Career_Site` |
| 2 | Analytics Engineer – People Data | surfaced on **LinkedIn** |
| 3 | Senior Data Engineer | **Intuitive Surgical** · `careers.intuitive.com` (vanity-domain Workday) |
| 4 | Staff Data Engineer - Technical Strategic Programs | **Intuit** · Workday `intuit.wd1…`, site `Intuit_Careers` |

**The funnel autopsy:** all four die at the **source-acquisition layer** (the query / target
resolution), **not** at the post-fetch filters. Every title passes `isDeTitle` (incl. "analytics
engineer") and "California - San Francisco" passes `checkLocation`. The jobs never enter the funnel —
so tuning filters would change nothing. The fix belongs at the scrapers and at target resolution.

### Where each job dies

| # | Dies at | Root cause |
|---|---------|-----------|
| 1 | Workday CXS query | **(B)** stored site likely `ExternalCareersPage`; the live req is on `External_Career_Site` → wrong endpoint. **(A)** even on the right site, a top-20 unfaceted global "Data Engineer" search buries the Bay role. |
| 2 | LinkedIn query | **(D)** keyword hardcoded to `Data Engineer` → "Analytics Engineer" never surfaced; the fallback only runs for companies that have a `linkedinId` **and** no native board. |
| 3 | Target resolution | **(C)** vanity domain → no derivable Workday tenant, `boardToken` never written → no native scrape; no `linkedinId` → no fallback → **total blackout, never queried**. |
| 4 | Workday CXS query | **(A)** `SEARCH = {appliedFacets:{}, limit:20, offset:0, searchText:"Data Engineer"}` — single page, no pagination, no location facet; the Bay-Area Staff DE role ranks past the global top-20. |

## 2. Root causes (systemic)

- **(A) Workday CXS adapter is too shallow** — one page of 20, no pagination, no location facet, a
  single keyword. Big sponsors lose their Bay-Area roles past the global top-20. *(Misses #1, #4.)*
- **(B) No Workday token verification** — a stored `host|tenant|site` pointing at a dead/empty site
  fails silently; the only existing signal is `jobs.length === 0` (`zeroBoards`). *(Adds to #1.)*
- **(C) No board-token detection anywhere** — `refreshScrapeTargets` never writes `boardToken`;
  `workdayTargets()/greenhouseBrands()/linkedinCompanyIds()` in `company-registry.ts` are **legacy**
  (only a test imports them). Vanity-domain Workday companies (Intuitive + ~18 like
  Cisco/ServiceNow/VMware) are unreachable. *(Miss #3.)*
- **(D) LinkedIn fallback keyword too narrow** — `linkedinSearchUrl` hardcodes `keywords=Data Engineer`.
  *(Miss #2.)*
- **(E) No coverage observability** — `Scrape_Targets.lastScraped` / `lastJobCount` exist but are never
  written; "fetched N, kept 0" (the wrong-site signature) is invisible.

## 3. Goals / non-goals

**Goals**
- The four named jobs (and roles like them) get captured into `Job_Listings` on a normal run.
- Per-company coverage is visible (`lastScraped`, `lastJobCount`, a "fetched-but-kept-0" list) so
  future blind spots surface instead of failing silently.
- Stay within the H1B allowlist and the draft-only guardrails. No new Airtable schema.
- Respect the Vercel Hobby envelope: ≤60s/function, 2 daily crons, one ~48s scrape invocation.

**Non-goals**
- Broadening beyond DE-adjacent titles (ML/DS/DA stay out — `DE_TITLE_RE` unchanged).
- Lifting H1B source-scoping.
- Per-tenant Workday **location** facets (GUIDs are tenant-specific and not derivable — we rely on
  keyword breadth + `checkLocation` instead).

## 4. Solution — staged

### Stage 1 — Deepen the Workday adapter *(fixes #4; helps #1)* — **implemented**
`boards/workday.ts` + new `boards/keywords.ts`.
- Shared `DE_KEYWORDS = [data engineer, analytics engineer, data platform, data infrastructure, etl,
  data warehouse, data architect]` (each satisfies `DE_TITLE_RE`).
- `fetchWorkdayBoard(token, company, {deadlineMs})` loops keyword × page: POST
  `{appliedFacets:{}, limit:20, offset:N, searchText:kw}` until a page returns `< limit` or `PAGE_CAP=3`;
  page-0 of every keyword in parallel, deeper pages only where page-0 filled.
- **Dedup by requisition id** (`workdayReqId`, the trailing `_JR…` of `externalPath`) across all
  keyword/page results; cap ~120 unique reqs/company.
- Pure, unit-tested helpers: `workdayReqId`, `parseWorkdayPostings(pages, company, host, site)`.
- Per-board `AbortController` deadline (~8s, never past the global scrape deadline); 6s/request.

### Stage 2 — Broaden the LinkedIn fallback *(fixes #2)* — **implemented**
`scrapeJobs.ts#linkedinSearchUrl` takes a keyword string, defaulting to an OR-join of `DE_KEYWORDS`
(`"data engineer" OR "analytics engineer" OR …`). One Apify run (N runs would blow the poll deadline);
`isDeTitle` + `checkLocation` still gate downstream. `LI_COUNT` 50 → 75.

### Stage 3 — Coverage observability *(makes #1/#3 visible)* — **implemented**
`scrapeJobs.ts`: track per-board `{fetched, kept}`; write `lastScraped` + `lastJobCount` back to
`Scrape_Targets` per native company (batched `updateRecords`, `!dryRun`). Add a **fetched-but-kept-0**
list to the run-log `coverage` notes (the wrong-site/token signature).

### Stage 4 — `detect_boards` auto-detection *(fixes #3 + ~18 vanity Workday; self-heals #1)* — **implemented**
New chunked workflow `detectBoards.ts`. Per Workday candidate:
1. **Resolve** a `{host, tenant, site?}` — from an existing token, a myworkdayjobs careers URL, or by
   FOLLOWING a vanity careers URL (`fetch(careersUrl, {redirect:"follow"})`) and scanning the final URL
   + HTML via the pure `extractWorkdayToken` (prefers the `/wday/cxs/{tenant}/{site}` API path the SPA calls).
2. **Probe + repair** — `probeWorkdaySite` (exported from `workday.ts`) hits `/wday/cxs/{tenant}/{site}/jobs`;
   try the derived site then `siteFallbacks` (`External_Career_Site, ExternalCareersPage, External, careers,
   {Tenant}ExternalCareerSite, …`); the first site that surfaces DE roles wins (discovers Salesforce's
   `External_Career_Site`).
3. Write `boardToken` + a **terminal** `coverageStatus` (`detected`/`undetectable`) via `updateRecords`.
4. **Loop-safety:** the candidate rule (`workdayNeedsDetection`) is **status-driven** — `ats==="workday"` and
   `coverageStatus ∉ {detected, undetectable}` — so every processed target drops out next chunk; the chunk
   loop always terminates. Dry-run pages by offset (no writes).
5. **Self-healing trigger:** `scrapeJobs` flips a Workday board from `detected → needs_detection` only on a
   true regression (returned jobs before, `lastJobCount>0`, now `0`) — no oscillation for consistently-empty
   boards. Runs LAST in the `pipeline` cron (leftover budget) + manually via the **Detect Boards** card / `POST
   /api/workflows/detect_boards`. Registered in `execute.ts`, `types.ts` (`WorkflowName`); no new cron (Hobby
   2-cron cap respected).

### Stage 5 — Execution-budget fallback *(conditional)* — **next, only if needed**
Keep the single ~48s invocation with Stage-1 bounds + a ≤8-company Workday concurrency limiter. If the
run log shows `partial` / truncation: first drop to 4 keywords; then, if still over budget, restructure
`scrape_jobs` to chunk by company batches (cursor = offset into native targets, `more:true` until done)
— `drive.ts` + `executeChunk` already drive `more`/`cursor`.

## 5. Acceptance criteria

- `npm run build` + `npm test` green; new pure tests for Workday pagination/dedup, `probeWorkdaySite`
  ordering, and `isDeTitle("Analytics Engineer – People Data")`.
- On a deployed `{dryRun:true}` run: Intuit "Staff Data Engineer - Technical Strategic Programs" and the
  Analytics-Engineer role appear in counts; Salesforce shows in the fetched-but-kept-0 list (its
  site-fix lands with Stage 4).
- After a live run: the four titles are queryable in `Job_Listings`; `Scrape_Targets.lastJobCount` is
  populated for native companies.
- Post-Stage-4: Intuitive Surgical and Salesforce resolve to working board tokens and their DE roles
  land.

## 6. Budget analysis

Companies scrape in parallel (`Promise.all`), so Workday's added wall-clock ≈ the slowest single board
(~8s deadline), **not** the sum. Per Workday company: 7 keyword page-0 POSTs in parallel, then ≤2 deeper
pages only for full keywords — typically ~7–12 POSTs, ~3–6s. Risk is many companies × many POSTs
running under the concurrent Apify poll; the ≤8 Workday limiter caps in-flight connections (~80, not
~400) and keeps the native phase ~15–20s, leaving the rest of the 48s for Apify. If telemetry shows
truncation, Stage 5 applies.

## 7. Rollout & verification

1. `cd app && npm run build && npm test`.
2. `vercel --prod`; `GET /api/health/credentials` → `AIRTABLE_TOKEN` + `APIFY_TOKEN` live.
3. `POST /api/workflows/scrape_jobs {check:true}` → resolved native/fallback mix.
4. `POST /api/workflows/scrape_jobs {dryRun:true}` → coverage notes incl. fetched-but-kept-0.
5. Live run → verify the four titles in `Job_Listings` + `Workflow_Runs` notes + `lastJobCount`.
