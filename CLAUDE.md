# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **Next.js 14 (App Router, TypeScript, Tailwind) dashboard + workflow engine** for a data-engineering
job search. Two halves share one Airtable-backed data layer:

1. **Read-only dashboard** — pages under `app/src/app/*` render the pipeline (Job_Listings,
   Applications, Interviews, Outreach/Leads, Target Companies) from Airtable.
2. **Workflow engine** (`app/src/lib/workflows/`) — *advances* the pipeline: scrapes jobs, syncs
   application/interview status from Gmail, researches leads, drafts outreach, all behind in-app
   human review gates.

The Next.js project lives in **`app/`** — run all commands from there. Build state, design, and
decisions live in **`docs/plan/IMPLEMENTATION-workflow-engine.md`** (the live, resumable tracker —
read it first) and **`docs/plan/PRD-workflow-engine.md`** (spec). Gmail OAuth setup is in
`docs/plan/SETUP-gmail-oauth.md`.

## Commands (run from `app/`)

```bash
npm run dev            # local dev server (note: secrets don't resolve locally — see below)
npm run build          # production build + full typecheck (run before every deploy)
npm test               # vitest — pure-function unit + guardrail tests
npx vitest run src/lib/workflows/filters.test.ts      # one test file
npx vitest run -t "isDeTitle"                          # tests matching a name
npm run lint
vercel --prod --yes    # deploy (CLI only — see deploy model)
```

## Deploy & runtime model (important, non-obvious)

- **Vercel, Hobby plan.** Deploy is **CLI-only** (`cd app && vercel --prod`); there is **no git
  remote / CI**. Prod alias: `job-application-dashboard-nine.vercel.app`.
- **Secrets only resolve in the Vercel runtime.** `vercel env pull` and `next dev` see them as
  empty, so you **cannot** verify credentials locally. Hit the deployed
  **`GET /api/health/credentials`** to check which env vars are live. **Env var changes require a
  redeploy** to take effect.
- **Hobby caps each function at ~60s** and allows **2 daily cron jobs only**. This constraint shapes
  the entire workflow-execution design below.

## Architecture

### Data layer — `app/src/lib/airtable.ts`
- Talks to **two Airtable bases**: `Job Outreach` (Job_Listings, Applications, Interviews,
  Workflow_Runs, H1B_Companies) and `Automation Dev Outreach` (Leads). IDs + per-table field maps
  are constants (`TABLES`, `FIELDS`) at the top; all reads/writes use **field IDs**
  (`returnFieldsByFieldId=true`), never names.
- Reads (`listJobListings`, `listLeads`, …) cache **30s** by default. Pass **`{ fresh: true }`** for
  interactive surfaces and dedup snapshots (it switches to `cache:"no-store"`) — a stale read here
  is the cause of "the action didn't update" and "scrape created duplicates" classes of bug.
- Writes (`createRecords`/`updateRecords`) batch ≤10 and send **`typecast:true`** (so single-select
  option names create-on-write). **Airtable percent fields store a fraction** — write `score/100`,
  read `raw*100`.
- `fetcher.ts` wraps reads with a mock-data fallback (`mock.ts`) so pages render without creds.

### Workflow engine — `app/src/lib/workflows/`
Hybrid by design: **deterministic TypeScript for mechanical steps; the Anthropic API only for
judgment** (Gmail email classification, email drafting). The five workflows:
`scrapeJobs`, `syncApplications`, `syncInterviews`, `researchLeads`, `draftEmails`. Shared modules:
`filters.ts` (H1B/DE-title/location/dedup/match-score — pure, unit-tested), `gmail.ts` (engine Gmail
client; **no send path**), `llm.ts` (Anthropic over fetch, prompt-caching on the system block),
`knowledge.ts` (voice/about/location vendored as **TS string constants**, not `.md`, so they bundle
into serverless functions), `runLog.ts`, `execute.ts`, `drive.ts`.

**Execution under the 60s cap** — each workflow does a small unit and is resumable:
- **Chunked workflows** (`syncApplications`/`syncInterviews`/`researchLeads`/`draftEmails`): process
  a few items (1/invocation for the LLM-heavy `research`/`draft_emails`, 3 for the fast Gmail-sync),
  return a **cursor + `more`**; the client (`workflows/RunButton.tsx` chunk-loop) or the cron
  re-invokes until done. `execute.ts#executeChunk` is the single dispatch shared by the manual route
  and cron.
- **`scrapeJobs` is different**: it starts **all sources in parallel** (Apify LinkedIn + Greenhouse,
  polled; Workday via its public CXS JSON API, direct) and finishes the whole scrape in **one
  invocation within a ~48s poll budget**; a source that doesn't finish is skipped (`partial`) so the
  run never hangs. (It used to be a per-step cursor like the others — that timed out on cron.)
- **Every run logs to the `Workflow_Runs` table** (`runLog.ts#withRunLog` per chunk; `scrapeJobs`
  self-manages one row across its parallel run).

**Triggers:**
- Manual: `POST /api/workflows/[name]` (body `{trigger,maxItems,dryRun,cursor,check}`); `{check:true}`
  on `scrape_jobs` returns the resolved inputs without running.
- Scheduled: `vercel.json` → 2 daily crons → `GET /api/cron/[job]` → `drive.ts#driveJob`
  self-drives each chunk loop within a wall-clock budget. Cron endpoints require **`CRON_SECRET`**
  (Vercel injects it as a bearer; the code enforces it when set).
- Human gates: `/outreach-review` page → `POST /api/review/{lead,draft}`. **Draft approval is the
  only place a Gmail draft is ever created.**

### Pipeline flow
`scrapeJobs` → Job_Listings (Apify + Workday, **H1B source-scoped**, match-scored, deduped) ·
Gmail `syncApplications`/`syncInterviews` → Applications/Interviews (and propagate `applied` back
onto the matching Job_Listings row) · `researchLeads` (Apollo) → Leads(`research`) → **approve at
/outreach-review** → `draftEmails` → Leads(`draft_pending`) → **approve** → labeled Gmail **draft**
(never sent), Leads(`draft`).

## Guardrails (non-negotiable — enforced in code + `guardrails.test.ts`)
- **Never send.** No Gmail send endpoint exists anywhere in `src` (a test asserts this). Outreach
  terminates at a Gmail **draft**.
- **Human gate before Gmail.** `draftEmails` only sets `draft_pending`; promotion to `draft`
  (which creates the Gmail draft) happens **only** in `api/review/draft/route.ts` (a test asserts
  this is the only writer).
- **H1B allowlist** source-scopes *proactive* work (scraping/research) to known sponsors
  (`company-registry.ts`); reactive Gmail sync uses **pipeline-scope** (allowlist OR already-tracked
  company) so active non-allowlist opportunities aren't dropped.
- **Idempotent + monotonic.** Canonical-key dedup (`filters.ts#canonicalJobKey`); never regress a
  later status (`syncApplications.ts#shouldAdvance`).

## Gotchas that span multiple files
- **Env overrides can silently disable source-scoping.** `APIFY_LINKEDIN_INPUT`/
  `APIFY_GREENHOUSE_INPUT` fully replace the baked-in actor inputs, so `scrapeJobs.ts#sources()`
  **force-merges** the guardrail bits on top of any override: Greenhouse `companies_include`,
  LinkedIn `f_C` company filter, and the count/page-size floors. Don't move these back into the
  defaults.
- **LinkedIn company IDs** for the `f_C` filter live in an editable **`H1B_Companies."LinkedIn
  Company ID"`** Airtable column (`listH1bLinkedinIds`), merged with the code registry — populate the
  column to source-scope LinkedIn, no redeploy needed.
- **Two Gmail clients**: `lib/gmail.ts` (read-only thread viewer for the dashboard) vs
  `lib/workflows/gmail.ts` (the engine client — search/read + `createDraft`/`label`, scope
  `gmail.modify`, no send). Use the latter in workflows.
- **Match score** is deterministic (`filters.ts#matchScore`); `isDeTitle` matches a substring set
  (`data engineer|analytics engineer|data platform|data infra`), so fuzzy sources (e.g. Workday) can
  surface tangential "…Data Platform…" titles — tighten the filter, not the source, if undesired.

## Conventions
- Project-wide standards (TS strict, structured data, draft-only/H1B job-search guardrails) come from
  the workspace root `../CLAUDE.md` and the global config; this project inherits them.
- After any meaningful change, **update the change log + phase tracker in
  `docs/plan/IMPLEMENTATION-workflow-engine.md`** — it is the source of truth for build state and the
  first thing to read when resuming.
