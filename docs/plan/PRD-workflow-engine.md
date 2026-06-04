# PRD — Workflow Engine inside the Job Application Dashboard

**Owner:** Tejas Arackal · **Author role:** Solution architect + dashboard FE engineer
**Last updated:** 2026-05-29
**Scope:** Two projects only — `automate-job-search` (working prompt SOPs) and this dashboard. No other project is referenced.
**Status:** Draft PRD for approval.

---

## 1. Context & Problem

The dashboard is a polished **read-only** window onto Airtable (Job_Listings, Applications,
Interviews, Leads, H1B_Companies), Apollo, and Apify. But the data it shows is kept fresh by
**manually running prompt-driven SOPs** (`automate-job-search/_instructions_*.md`) inside Claude
Code sessions with MCP connectors. Nothing in the dashboard can *do* anything — to scrape new
jobs, sync application/interview status from Gmail, research leads, or draft outreach, Tejas has
to leave the dashboard and run an instruction file by hand.

**Goal:** Turn the working SOPs into **first-class, triggerable workflows inside the dashboard** —
so the dashboard both *shows* the pipeline and *advances* it, while preserving every hard-won
guardrail (draft-only, human approval gate, H1B allowlist, idempotency) the SOPs encode.

This deliberately ends the dashboard's current "read-only / no write-back" non-goal — that revisit
was already anticipated in `docs/plan/NEXT_STEPS.md` ("Airtable write-back … revisit deliberately").

---

## 2. Scope

### In scope (confirmed)
**Cluster A — Pipeline data-sync** (keeps the dashboard's own pages accurate):
| Workflow | Source SOP | Writes |
|---|---|---|
| Job scraping (scheduled + adhoc) | `_job_scraping_instruction.md`, `_adhoc_scraping_instructions.md` | Job_Listings, Scrape_Log |
| Application status sync from Gmail | `_instructions_update_applications.md` | Applications |
| Interview sync from Gmail | `_instructions_gmail_scrape_interviews.md` | Interviews |

**Cluster B — Outreach generation** (with in-app human gates):
| Workflow | Source SOP | Writes |
|---|---|---|
| Lead research | `_instructions_research.md` (Step 1) | Leads (Status=research) |
| Email drafting | `_instructions_emails.md` (Step 3) | Gmail drafts, Leads (Status=draft) |
| Human gate (lead approval + draft review) | Step 2 (manual today) | Leads status transitions |

### Out of scope (deferred)
- **Apply automation** (`_instructions_apply.md`, Workflow B) — needs real browser automation,
  which cannot run in the dashboard's serverless model. Stays in Claude-in-Chrome for now. The
  dashboard will *surface* apply-ready listings and deep-link out, but not fill forms.
- **Sending** anything — non-negotiable. Gmail drafts are the terminal output, forever.

---

## 3. Decisions (locked) + rationale

| # | Decision | Rationale / trade-off |
|---|---|---|
| D1 | **Hybrid execution**: deterministic TS for mechanical steps; Anthropic API only for judgment steps | Mechanical steps (Apify scrape, dedup, Airtable upsert, status transitions, Gmail search, stage keyword-map) are deterministic, testable, cheap. LLM is reserved for **email drafting** and **Gmail email classification/extraction** where the SOPs explicitly rely on judgment. Con: two execution paths — mitigated by isolating LLM calls behind one `llm.ts` module. |
| D2 | **Trigger = manual + scheduled** | Matches today's cadence (10am research / 5pm drafts) and gives hands-off freshness. Implemented with on-demand API routes + **Vercel Cron**. Con: cron needs the workflow endpoints to be fast/chunked (see R1). |
| D3 | **In-dashboard review UI** for human gates | Lead approval and draft review happen *in the app*; nothing reaches Gmail until Tejas approves. Real product value + makes the human gate visible and enforced. Con: more UI; deliberately ends read-only. |
| D4 | **Stay dashboard-hosted on Vercel** (no new external service) | Dropping apply-automation removes the only browser need, so everything left is API + LLM and fits Vercel route handlers + Vercel Cron + an Airtable run-log. Keeps the system to the two in-scope projects. **Vercel plan = Hobby (CONFIRMED 2026-05-29).** Short function limit (~10–60s), no background jobs → **every workflow must do one small unit of work per invocation and return fast**; multi-unit jobs are driven incrementally (client poll-loop or Vercel Cron re-invoking until `Workflow_Runs` shows done). No single handler loops over many items. |
| D5 | **Vendor the SOP "knowledge" into the dashboard repo** | The dashboard (Vercel) can't read `automate-job-search/*.md` at runtime. The reference content (`_voice_guidelines.md`, `_about_me.md`, `_location_preferences.md`, H1B allowlist) must be copied into the dashboard repo as the source for prompts + filters. The H1B list is **already vendored** in `app/src/lib/company-registry.ts`. Con: two copies to keep in sync — mitigated by a single `lib/workflows/knowledge/` dir + a documented sync note. |

---

## 4. Target Architecture

```
┌────────────────────────── Job Application Dashboard (Vercel) ──────────────────────────┐
│                                                                                          │
│  UI (App Router pages)                                                                   │
│   • existing read pages (Overview, Listings, Applications, Interviews, Outreach, Targets)│
│   • NEW: /workflows  — run console: trigger buttons, live status, run history            │
│   • NEW: /review     — lead approval + draft review (the human gates)                    │
│                                                                                          │
│  API route handlers (server-only, hold secrets)                                          │
│   • POST /api/workflows/<name>/run     ← manual trigger                                   │
│   • GET  /api/workflows/runs           ← run history/status (polls Workflow_Runs)         │
│   • POST /api/review/lead, /api/review/draft   ← approve/edit/reject                       │
│   • GET  /api/cron/<job>               ← Vercel Cron hits these on schedule               │
│                                                                                          │
│  lib/workflows/   (hybrid logic)                                                         │
│   • scrapeJobs.ts  syncApplications.ts  syncInterviews.ts  researchLeads.ts  draftEmails.ts│
│   • shared: filters.ts (H1B/location/DE-title) · gmail.ts · llm.ts · runLog.ts            │
│   • knowledge/: voice.md  about.md  location.md  (vendored from automate-job-search)      │
│  lib/airtable.ts  ← extend with createRecords()/updateRecords() (today read-only)         │
│                                                                                          │
└──────────────┬───────────────────────────────────────────────────────────┬─────────────┘
               │                                                             │
   external APIs (server-side)                                   Airtable (source of truth)
   Apollo · NinjaPear · Apify · Gmail API · Anthropic            + NEW Workflow_Runs table
```

**Run lifecycle:** trigger → write a `Workflow_Runs` row (`running`) → execute (chunked if needed)
→ update row (`success|partial|failed` + counts + notes) → UI polls `/api/workflows/runs`.
This mirrors the existing `Scrape_Log` pattern the SOPs already use, generalized to all workflows.

---

## 5. Workflow specifications (code vs LLM split)

### A1 · Job scraping  → Job_Listings + Scrape_Log
- **Trigger:** manual ("Scrape now" on Listings) + cron (hourly/adhoc 24–48h window).
- **Code:** call Apify board actors (Greenhouse/Lever/LinkedIn/Workday) or web; **post-fetch filter** (all must pass): H1B allowlist (reuse `company-registry.ts`), location (`knowledge/location.md`), DE-title regex `/data engineer|analytics engineer|data platform|data infra(structure)?/i`, freshness when a window is set; **dedup** on per-ATS canonical key (Greenhouse `(slug,id)`, Lever `(org,id)`, Workday `(tenant,JR-id)`); **upsert** Job_Listings; write Scrape_Log.
- **LLM:** none (all rules are deterministic in the SOP).
- **Idempotency:** canonical-key dedup; update only changed fields.
- **Known gap (R2):** Step-5 liveness re-verify used Chrome; server-side `fetch` can't confirm CSR pages → mark `liveness=unverified` rather than guessing.

### A2 · Application status sync  → Applications
- **Trigger:** manual ("Sync applications") + nightly cron.
- **Code:** Gmail API full-text search, 4 query sets (confirmation/rejection/interview/offer, 45d) from the SOP verbatim; **anchor rule** (company on allowlist OR existing Applications/Interviews/Leads row OR body references the role); dedup match (Job URL → Company+Title → Company+recruiter email); **monotonic** status writes (never regress offered→submitted).
- **LLM:** classify each candidate thread → `{status, company, role, stage}` because the SOP requires "classify by content, not by which query matched" and excludes own-employer/service-provider noise. One cached system prompt encoding the SOP's classification + exclusion rules.
- **Idempotency:** monotonic status; provenance note `status from Gmail thread {id} on {date}`.

### A3 · Interview sync  → Interviews
- **Trigger:** manual + nightly cron (same pass as A2).
- **Code:** Gmail search (invites/scheduling-links/feedback) with anchor rule; **stage keyword-map** (deterministic, most-specific-first, e.g. "HM"/"fit call"→Hiring Manager); dedup on Company+Role+Stage; link Job_Listings/Applications; upsert Interviews.
- **LLM:** extract free-text fields (interviewer, interviewer title, call link, scheduled-at) and stage when the keyword map is ambiguous.

### B1 · Lead research  → Leads (Status=research)
- **Trigger:** manual ("Research companies" / "Research {domain}") + 10am cron.
- **Code:** Step-0 weighted company selection from the vendored H1B list (LCA × recency penalty); Apollo people search + email enrichment; NinjaPear company details/funding/employee-count; job_posting signal via the **ATS-aware** search (reuses the `ats`/`careersUrl` registry already in `company-registry.ts`); funding→stage mapping; dedup by Email/LinkedIn; write Leads.
- **LLM:** summarize the recent signal + extract data-stack from JD/blog text (light judgment).
- **Idempotency:** skip existing Email/LinkedIn; LinkedIn-only fallback when no email.

### B2 · Human gate — lead approval (in-dashboard)
- `/review` lists Leads with `Status=research` → **Approve / Edit / Reject** → Approve sets `Status=approved`. Pure Airtable write; no external calls.

### B3 · Email drafting  → Gmail drafts + Leads (Status=draft)
- **Trigger:** manual ("Generate drafts") + 5pm cron, over `Status=approved` leads.
- **LLM:** draft subject + 3-paragraph body per `knowledge/voice.md` + `knowledge/about.md` (the exact brief in `_instructions_emails.md`). Store generated subject/body on the Lead as `Status=draft_pending` — **not yet in Gmail**.
- **Human gate (in-dashboard):** `/review` shows generated drafts → Approve / Edit / Reject.
- **Code (only on approve):** Gmail `create_draft` → `list_drafts` to resolve the **message id** (the SOP's BUG-001 fix) → `label_message` "Job Outreach" → update Lead `Status=draft` + store final subject/body. **Never sends.**

---

## 6. Data-model changes

**Airtable (new):** `Workflow_Runs` table (Job Outreach base) — `Workflow` (single-select: scrape_jobs / sync_applications / sync_interviews / research / draft_emails), `Trigger` (manual/scheduled), `Status` (running/success/partial/failed), `Started At`, `Finished At`, `Counts` (JSON/long-text: scanned/created/updated/skipped), `Notes`. Generalizes the existing `Scrape_Log`.

**Airtable (Leads, additive):** new status values `draft_pending` (generated, awaiting review) and `rejected`; reuse existing `Email Subject` / `Email Body` fields to hold the pre-Gmail draft.

**Dashboard code:**
- `app/src/lib/airtable.ts` — add `createRecords()` / `updateRecords()` (Airtable REST POST/PATCH, batched ≤10) reusing the existing field-ID maps + `selectName()` helpers; add field maps for `Workflow_Runs` and the new Lead fields.
- `app/src/lib/types.ts` — `WorkflowRun`, `WorkflowName`, extend `OutreachContact` for draft fields.
- `app/src/lib/gmail.ts` — extend the dormant client from read-only to: search (`gmail.readonly`), create draft (`gmail.compose`), label (`gmail.modify`).

---

## 7. UI / UX surfaces

- **`/workflows`** (new): per-workflow cards with **Run** button, last-run status pill (reuse `StatusBadge`), counts, and a `Workflow_Runs` history table (reuse `DataTable`). Live status via polling `/api/workflows/runs`.
- **`/review`** (new): two tabs — **Leads** (`research` rows: Approve/Edit/Reject) and **Drafts** (`draft_pending` rows: rendered email + Approve/Edit/Reject). Editing is inline; Approve triggers the write/Gmail step.
- **Inline triggers** on existing pages: "Scrape now" (Listings), "Sync from Gmail" (Applications + Interviews), "Research / Generate drafts" (Outreach) — all post to `/api/workflows/<name>/run`.
- **Attention badges:** counts of `research` + `draft_pending` items needing review, surfaced on Overview.

---

## 8. Integrations & credentials (must be provisioned in Vercel env)
| Service | Var | Status | Use |
|---|---|---|---|
| Airtable | `AIRTABLE_TOKEN` | ✅ set | read + new writes |
| Apollo | `APOLLO_API_KEY` | ✅ set | lead search + enrich |
| Anthropic | `ANTHROPIC_API_KEY` | ❌ needed | drafting + classification (with prompt caching) |
| NinjaPear | `NINJAPEAR_API_KEY` | ❌ needed | company research |
| Apify | `APIFY_TOKEN` | ❌ needed | job board scraping |
| Gmail | OAuth refresh token | ❌ needed | scopes: `gmail.readonly` (search) + `gmail.compose` (drafts) + `gmail.modify` (label). **Bigger scope than the read-only token NEXT_STEPS contemplated** — required to create drafts. |

---

## 9. Non-negotiable guardrails (enforced in code, not just prompts)
1. **Never send / never accept invites** — no Gmail send API is ever imported; drafting stops at `create_draft`.
2. **Human gate before Gmail** — drafts require explicit in-app approval; `draft_pending` never auto-promotes.
3. **H1B allowlist** gates *proactive* targeting (research/scraping); status/interview sync uses **pipeline-scope** (allowlist OR existing row) so active non-allowlist opportunities (e.g. GEICO) aren't dropped.
4. **Idempotent + monotonic** — dedup keys per SOP; never regress a later status.
5. **Apply automation stays manual** — no form-fill from the dashboard.

---

## 10. Key risks & mitigations
- **R1 — Vercel function duration (Hobby, CONFIRMED).** Short limit (~10–60s), no background jobs. *Mitigation (mandatory):* every workflow does **one small unit per invocation** (classify one thread, research one company, one Apify page) and returns fast; multi-unit jobs are driven incrementally by a client poll-loop or Vercel Cron re-invoking until `Workflow_Runs` shows done. Each handler stays well under the limit; nothing loops over many items in a single request.
- **R2 — CSR liveness gap (no Chrome).** Server `fetch` can't verify client-rendered job pages. *Mitigation:* verify non-CSR via fetch; mark CSR rows `liveness=unverified`; manual apply re-verifies. Don't fabricate liveness.
- **R3 — LLM cost.** Per-thread classification + drafting consume Anthropic API tokens (separate from Claude Pro). *Mitigation:* prompt caching on the system prompts; batch threads; cron rate-limited.
- **R4 — Knowledge drift.** Vendored copies of voice/about/location/H1B can fall behind `automate-job-search`. *Mitigation:* single `knowledge/` dir + a sync checklist; later a small sync script.
- **R5 — Gmail OAuth scope creep.** `gmail.compose` is broader than today's read-only intent. *Mitigation:* dedicated token, least-privilege, documented; still never `send`.

---

## 11. Phased rollout
1. **Phase 0 — Foundations:** `airtable.ts` write helpers + `Workflow_Runs` table + `/api/workflows/runs` + `/workflows` page skeleton + run-log writer. (No external writes yet.)
2. **Phase 1 — Data-sync (read-heavy, low risk):** A1 job scraping → A2 app sync → A3 interview sync. Manual triggers first; validate against current Airtable counts.
3. **Phase 2 — Outreach generation + gates:** B1 research → `/review` lead approval → B3 drafting → `/review` draft approval → Gmail draft creation.
4. **Phase 3 — Scheduling:** Vercel Cron for the 10am/5pm/nightly/hourly cadences; chunking hardened.
5. **Phase 4 — Hardening:** loading/error states, idempotency tests for each `lib/workflows/*` module, LLM-cost guards, knowledge-sync script.

---

## 12. Success criteria
1. Every in-scope SOP is runnable from the dashboard and produces the **same Airtable writes** a manual SOP run would.
2. No Gmail draft is ever created without an explicit in-app approval; no send API exists in the codebase.
3. Re-running any workflow is idempotent (no duplicate Job_Listings/Applications/Interviews/Leads).
4. Manual + scheduled triggers both work; `Workflow_Runs` shows accurate status/counts/history.
5. Funnel counts on Overview match reality after a sync, with no manual Airtable edits.

---

## 13. Verification plan
- **Per-module unit tests** (new test setup) for filters (allowlist/location/DE-title), dedup keys, monotonic status, draft message-id resolution — using fixtures from real SOP examples (e.g. the GEICO interview, the Airbnb dup-URL case).
- **Idempotency:** run each workflow twice against a scratch Airtable view; assert zero new rows on the 2nd run.
- **Guardrail test:** assert the build contains no Gmail `send` import; assert `draft_pending` never transitions to `draft` without the approval route.
- **End-to-end (staging):** trigger A2/A3 → confirm Applications/Interviews match a known Gmail window; run B1→review→B3 for one company → confirm a labeled Gmail **draft** exists and Leads=`draft`.
- **Parity check:** pick one company, run the dashboard workflow and the manual SOP, diff the Airtable rows.

---

## 14. Assumptions & open questions (flagged)
- **Vercel plan** (R1) — assuming Pro/`maxDuration=300`; confirm or we add chunking depth / a worker.
- **Gmail OAuth** — assuming a new token with compose scope is acceptable (vs keeping draft-creation in Claude Code).
- **Knowledge vendoring** — assuming copying voice/about/location into the dashboard repo is acceptable (vs a runtime sync).
- **Apify/NinjaPear keys** — must be supplied for A1 and B1 to run live; until then those cards stay mock/disabled.

---

## 15. Critical files (create / modify)
**Modify (reuse existing patterns):**
- `app/src/lib/airtable.ts` — add `createRecords`/`updateRecords`; new field maps. Reuse `fetchAllRecords`, `selectName`, base helpers.
- `app/src/lib/gmail.ts` — extend dormant client (search + create draft + label).
- `app/src/lib/types.ts`, `app/src/lib/fetcher.ts` — new types + run-status fetchers.
- `app/src/lib/company-registry.ts` — already vendored H1B + ATS registry; reuse for filters + research.

**Create:**
- `app/src/lib/workflows/{scrapeJobs,syncApplications,syncInterviews,researchLeads,draftEmails}.ts`
- `app/src/lib/workflows/{filters,gmail,llm,runLog}.ts` + `app/src/lib/workflows/knowledge/{voice,about,location}.md`
- `app/src/app/api/workflows/[name]/route.ts`, `app/src/app/api/workflows/runs/route.ts`, `app/src/app/api/cron/[job]/route.ts`, `app/src/app/api/review/{lead,draft}/route.ts`
- `app/src/app/workflows/page.tsx`, `app/src/app/review/page.tsx`
- `vercel.json` — `crons` config for the scheduled cadences.

**Reference (source of truth for logic/prompts, in `automate-job-search/`):** the five in-scope
`_instructions_*.md` files + `_voice_guidelines.md`, `_about_me.md`, `_location_preferences.md`,
`_h1b_companies.md`.
