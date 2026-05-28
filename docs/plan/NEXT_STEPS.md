# Next Steps — Job Application Dashboard

The dashboard is fully built but has **never been run, built, version-controlled, or deployed**,
and `node_modules` is missing. Ordering below is ship-first: get it live on mock data, then wire
real credentials, then harden.

All `npm`/`vercel`/`git` commands run from the **`app/`** folder unless noted.

---

## Phase 0 — Run & verify locally ✅ (2026-05-28)
- [x] `cd "Job Application Dashboard/app"`
- [x] `npm install` — 391 packages
- [x] `npm run build` — fixed 2 type errors: `gmail.ts` null-filter narrowing (annotated callback return `Promise<GmailThread | null>`), `utils.ts` duplicate `approved` palette key
- [x] `npm run dev` — served on :3002 (3000/3001 were busy)
- [x] All 6 pages return HTTP 200 in mock mode; nav renders
- [x] Mock pills present; `/api/airtable/summary` returns `{"source":"mock",...}`
- [ ] **Still TODO:** visual browser pass (above was a curl/HTTP smoke test, not a rendered-UI review)

> Heads-up: `npm install` flagged a security advisory on `next@14.2.15`. Consider bumping to a patched 14.2.x during Phase 5 (don't `audit fix --force` — it pulls breaking changes).

## Phase 1 — Version control
- [ ] Decide git root: **project root** `Job Application Dashboard/` (tracks `docs/` + `brand/`; set Vercel root directory to `app/`) **vs.** inside `app/` per DEPLOY.md Path B
- [ ] `git init` + verify `.gitignore` covers `node_modules`, `.next`, `.env*`
- [ ] Initial commit
- [ ] (Optional) `gh repo create job-application-dashboard --private --source=. --push`

## Phase 2 — Deploy to Vercel (mock data)
- [ ] `npx vercel login`
- [ ] `npx vercel link` → scope **Tejas Arackal's projects** (`team_4IeLgkmcM9kOuQ5OOAv1Hd00`), new project `job-application-dashboard`
- [ ] `npx vercel --prod`
- [ ] Capture the deploy URL; confirm it renders with Mock pills

## Phase 3 — Wire live data (incremental)
- [x] **Airtable (required):** `AIRTABLE_TOKEN` set in `app/.env.local` (copied from `job-outreach-portal`). Live verified 2026-05-28: targets 151, listings 1, outreach 17 (12 sent), applications 4. All sources show **Live**.
- [ ] **Apify (optional):** set `APIFY_TOKEN` → Overview scrape-health card goes Live. (No token in any sibling project — Tejas must supply.)
- [x] **Apollo (optional):** `APOLLO_API_KEY` wired from `job-outreach-engine`. Live, but **0 sequences** (outreach is manual) → card shows the honest empty state.
- [ ] **Gmail (optional):** still **mock** — needs a `gmail.readonly` `GOOGLE_REFRESH_TOKEN` (no gmail-scoped token exists anywhere; the sibling Google creds are Docs/Drive-scoped). Generate via OAuth Playground; can reuse `GOOGLE_CLIENT_ID`/`SECRET` from `job-outreach-engine`. `GMAIL_LABEL_ID=Label_3` **confirmed correct** ("Job Outreach" label) via the Gmail connector.

## Feedback fixes — 2026-05-28 ✅
- [x] **Field-ID bug:** `fetchAllRecords` now sends `returnFieldsByFieldId=true`; without it the Airtable API returned field *names*, so every field-ID lookup was `undefined` (counts right, all cells blank).
- [x] **Outreach = Leads only:** `getOutreach`/`getSummary` (fetcher) + the `outreach`/`summary` API routes now read `listLeads` (was the Outreach+Leads merge). `listOutreach`/`listAllOutreach` remain as unused client methods.
- [x] **Clickable funnel:** funnel rows deep-link via a stage→route map (`Funnel.tsx` `href` + `page.tsx` `FUNNEL_ROUTES`).
- [x] **Funnel "Applied" count:** was counting listings marked applied (1); now uses `applications.length` (4) in `summarize()`.
- [x] **Interviews "Active" count:** was counting `submitted` apps as active interviews (showed 1); now only `status==="interviewing"` or a recorded `interviewStage` (→ 0), matching the page's own empty-state copy.
- [x] **Apollo wired** (live, empty sequences) + **Gmail label id confirmed** `Label_3`.

## Phase 4 — Resolve open decisions
- [x] **Outreach source:** resolved → **Leads table only** (source of truth, 17/12).
- [ ] **Interviews page:** confirm it derives from `Applications` (interview stage) vs. needs its own query — see follow-up item 7 (dedicated `Interviews` table).
- [ ] **Gmail label:** verify `GMAIL_LABEL_ID=Label_3` is the real "Job Outreach" label id

## Phase 5 — Hardening
- [ ] Loading, empty, and error states for each card (today errors silently fall back to mock)
- [ ] Add a test setup (none exists) + a few integration tests for the `lib/` clients and `wrap()` fallback
- [ ] Accessibility pass (semantic tables, color-contrast on status badges, keyboard nav)

## Future
- [ ] Airtable write-back (e.g., update application status from the dashboard) — would end the read-only non-goal; revisit deliberately
- [ ] Auth, if ever hosted non-privately
- [ ] Scheduled refresh / response caching to cut API calls
- [ ] Link the dashboard from `job-outreach-portal`

---

## Cross-project follow-ups (in `automate-job-search/`)
Authored 2026-05-28 — SOPs that keep Airtable accurate so the dashboard stays correct. The `.md` files are **written**; running the scrape ones (items 2 & 6) needs an Apify run (no Apify connector here yet).

- [x] **Item 2 — `_job_scraping_instruction.md`** written: canonical job-scrape procedure (web *or* Apify) that upserts into `Job_Listings` (dedup by Job URL) + logs to `Scrape_Log`. `_instructions_research.md` now references it in the job_posting signal step. *(Run pending Apify — today live listings = 1 until scrapes are persisted.)*
- [x] **Item 4 — `_instructions_update_applications.md`** written + **validated on real Gmail**: created the GEICO `Engineer II – Data Engineer` application (status `interviewing`) from the interview thread, reconciling the funnel (Applied 5, Interviewing 1).
- [x] **Item 6 — `_adhoc_scraping_instructions.md`** written + **`Scrape_Log` table created** (`tblooa9mGdTX5jRMR`): sweep `_h1b_companies.md` for jobs posted/reposted in 24–48h per `_location_preferences.md`, persist via item 2, log the run. *(Run pending Apify.)*
- **Item 7 — `Interviews` table + `_instructions_gmail_scrape_interviews.md`** — DONE:
  - [x] `Interviews` table created (`tblq3kP2aT6mOTn6N`, 2026-05-28). 15 fields incl. links to Job_Listings + Applications.
  - [x] `_instructions_gmail_scrape_interviews.md` written.
  - [x] Dashboard Interviews page rewired to read the `Interviews` table (was derived from `Applications`).
  - [x] **Validated end-to-end:** synced the real GEICO recruiter prescreen (Jayashree Venkatachalam, Zoom, 2026-05-27) into the table (`recIHpLgjQuuviyiE`); the page renders it live.

## Gmail in the dashboard — RESOLVED 2026-05-28 (Airtable-sync)
- [x] Connector can't be used by the deployed app, so the raw Gmail-threads card was **removed** from Overview + Outreach (it was the only mock surface left). The dashboard takes Gmail data via Airtable instead (items 4 & 7 sync through the connector in-session).
- Dormant: `lib/gmail.ts` + `/api/gmail/threads` remain but are unused — re-enable only if a dedicated `gmail.readonly` token is ever wired.
