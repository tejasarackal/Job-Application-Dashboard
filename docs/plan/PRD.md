# PRD — Job Application Dashboard

**Status:** Built, not yet run/deployed · **Owner:** Tejas Arackal · **Last updated:** 2026-05-28

---

## 1. Problem & Goal

The DE job search spans four disconnected tools — Airtable (two bases), Apify (scraping),
Apollo (outreach), and Gmail (replies). There is no single place to see pipeline health:
how many leads are in flight, what's been applied to, which interviews are active, and which
target companies remain. Switching between four surfaces to answer "where does the search
stand?" is slow and error-prone.

**Goal:** A single read-only dashboard that unifies all four sources into one glance-able
pipeline view, deployed to Vercel, refreshing from live data.

---

## 2. Users & Use Case

- **Single user:** Tejas (the job seeker). No multi-user, no sharing.
- **Use case:** Open the dashboard, see pipeline status at a glance, drill into any stage.
  Pure consumption — no data entry; all writes happen in Airtable/Gmail directly.

---

## 3. Surfaces (Pages)

| Page | Must show |
|------|-----------|
| **Overview** | KPI tiles, pipeline funnel, recent applications + outreach, Apollo + Gmail snapshots |
| **Job Listings** | Apify-scraped postings (Greenhouse / Lever / LinkedIn / Workday) from `Job_Listings` |
| **Outreach** | Merged view of both outreach trackers (`Outreach` + `Leads`) with a Base chip per row, Apollo sequences, recent Gmail threads labeled "Job Outreach" |
| **Applications** | Every submission with status + interview stage |
| **Interviews** | Active applications and the stage funnel |
| **Target Companies** | H1B-friendly employers, sorted by LCA count |

Status badges across all surfaces use the Airtable Light2 palette so colors stay consistent
between the dashboard and Airtable.

---

## 4. Data Architecture

```
Airtable — Job Outreach base (app8aBP9UPmxYaEgI)
  ├─ Outreach       — manual cold-mail tracker
  ├─ H1B_Companies  — target list (LCA-verified)
  ├─ Job_Listings   — Apify writes scraped postings here
  └─ Applications   — linked to Job_Listings

Airtable — Automation Dev Outreach base (appkusCXgR7KcEmLO)
  └─ Leads          — sourced recruiter contacts (hiring signals, role level)

Apify  → writes scraped postings into Job_Listings
Apollo → outreach sequences (currently empty)
Gmail  → "Job Outreach" label is the read channel for reply tracking
```

The **Outreach** surface and the **Overview** summary merge `Outreach` + `Leads` into one list
(`listAllOutreach`). See Open Decisions.

---

## 5. Integration Requirements

- **Server-side only.** All four integrations run in route handlers / server components using
  env-var credentials. No keys reach the client.
- **Typed clients** in `app/src/lib/`: `airtable.ts`, `apollo.ts`, `apify.ts`, `gmail.ts`.
- **Live/Mock fallback.** The `wrap()` helper in `fetcher.ts` returns live data when the
  integration's env var is set, otherwise mock data; on error it falls back to mock and records
  the error. Each card shows a **Live / Mock pill** reflecting `source`.
- **Airtable field-ID map.** `airtable.ts` references fields by stable Airtable field **IDs**,
  not names (names can change, IDs don't). New fields must be added to the map at the top of that file.
- **Gmail is read-only** (`gmail.readonly` scope, OAuth refresh-token flow). Consistent with the
  global draft-only outreach policy: the dashboard never sends.

---

## 6. Non-Goals

- **No write-back** — the dashboard reads only; edits happen in Airtable/Gmail.
- **No authentication** — personal, single-user; not intended for public hosting as-is.
- **No sending** — honors the draft-only policy; no Gmail/SMTP send, ever.
- **No multi-user / sharing / roles.**

---

## 7. Success Criteria

1. `npm run build` compiles cleanly from a fresh `npm install`.
2. Deploys to Vercel and renders all 6 pages (mock data acceptable on first deploy).
3. With `AIRTABLE_TOKEN` set, Overview/Listings/Outreach/Applications/Targets show **Live** pills
   backed by real Airtable records.
4. Optional integrations (Apify/Apollo/Gmail) light up to **Live** as their credentials are added.

---

## 8. Open Decisions

- **Outreach source — RESOLVED 2026-05-28.** Outreach reads the **`Leads` table only** (Automation Dev
  Outreach base) as the source of truth (17 contacts / 12 sent). `getOutreach`/`getSummary` and the
  `outreach`/`summary` API routes use `listLeads`; the earlier `Outreach`+`Leads` merge is retired.
- **Interviews page data source — RESOLVED 2026-05-28.** Now reads a dedicated `Interviews` Airtable
  table (`tblq3kP2aT6mOTn6N`, Job Outreach base), populated from Gmail by
  `automate-job-search/_instructions_gmail_scrape_interviews.md`. No longer derived from `Applications`.
- **Gmail in the dashboard — RESOLVED 2026-05-28.** The deployed app can't use the Claude Gmail
  connector, so rather than wiring a per-app OAuth token, Gmail signals are synced into Airtable
  (Applications + Interviews) via the connector in-session; the dashboard reads Airtable. The raw
  Gmail-threads card was removed. `GMAIL_LABEL_ID=Label_3` ("Job Outreach") was confirmed correct,
  retained only for the dormant `lib/gmail.ts`.

---

## 9. Tech Stack

Next.js 14.2 (App Router) · React 18.3 · TypeScript 5.5 · Tailwind 3.4 · Vercel serverless
route handlers. Styled to the StarAdmin reference (indigo primary, pastel status badges, white
cards on near-white canvas, slim sidebar). Deployable folder: `app/`.
