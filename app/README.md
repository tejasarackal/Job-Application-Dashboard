# Job Application Dashboard

End-to-end pipeline view for the job search — pulls from Airtable (two bases), Apify, Apollo, and Gmail.

## What it shows

- **Overview** — KPI tiles, pipeline funnel, recent applications + outreach, Apollo + Gmail snapshots.
- **Job Listings** — Apify-scraped postings from Greenhouse/Lever/LinkedIn/Workday.
- **Outreach** — merged view of the two Airtable outreach trackers (`Outreach` table + `Leads` table), Apollo sequences, recent Gmail threads tagged `Job Outreach`.
- **Applications** — every submission with status + interview stage.
- **Interviews** — active applications and stage funnel.
- **Target Companies** — H1B-friendly employers (sorted by LCA count).

## Data architecture

```
Airtable: Job Outreach base (app8aBP9UPmxYaEgI)
  ├─ Outreach       — manual cold-mail tracker
  ├─ H1B_Companies  — target list (LCA-verified)
  ├─ Job_Listings   — Apify writes here
  └─ Applications   — linked to Job_Listings

Airtable: Automation Dev Outreach base (appkusCXgR7KcEmLO)
  └─ Leads          — sourced recruiter contacts (hiring signals, role level)

Apify  → writes scraped postings into Job_Listings
Apollo → optional outreach sequences (currently empty)
Gmail  → "Job Outreach" label is the read channel for reply tracking
```

## Local development

```bash
cp .env.example .env.local
# fill in AIRTABLE_TOKEN at minimum
npm install
npm run dev
```

Visit http://localhost:3000.

If an integration's env vars are missing, that section falls back to mock data and is tagged "Mock" in the UI. This lets you deploy first and wire credentials incrementally.

## Deploying to Vercel

The dashboard is built for Vercel out of the box (Next.js 14 App Router, serverless route handlers).

1. Push this folder to a GitHub repo.
2. Import in Vercel under the **Tejas Arackal's projects** team.
3. Set environment variables (see `.env.example`) in **Project Settings → Environment Variables**.
4. Redeploy.

## Env vars at a glance

| Variable | Required | Notes |
|---|---|---|
| `AIRTABLE_TOKEN` | yes | Personal Access Token with `data.records:read` + `schema.bases:read` on BOTH bases |
| `AIRTABLE_BASE_ID` | no | Defaults to `app8aBP9UPmxYaEgI` |
| `AIRTABLE_LEADS_BASE_ID` | no | Defaults to `appkusCXgR7KcEmLO` |
| `APIFY_TOKEN` | optional | Shows recent actor runs on Overview |
| `APOLLO_API_KEY` | optional | Shows Apollo sequences |
| `GOOGLE_CLIENT_ID` | optional | For Gmail read |
| `GOOGLE_CLIENT_SECRET` | optional | For Gmail read |
| `GOOGLE_REFRESH_TOKEN` | optional | Generate with the Gmail readonly scope |
| `GMAIL_LABEL_ID` | optional | Defaults to `Label_3` ("Job Outreach") |

## File map

```
src/
  app/
    page.tsx            — Overview
    listings/page.tsx
    outreach/page.tsx
    applications/page.tsx
    interviews/page.tsx
    targets/page.tsx
    api/
      airtable/{listings,outreach,applications,targets,summary}/route.ts
      apollo/sequences/route.ts
      apify/runs/route.ts
      gmail/threads/route.ts
  components/
    layout/{Sidebar,Header}.tsx
    ui/{Card,DataTable,Funnel,Stat,StatusBadge,SourceBadge,BaseTag}.tsx
  lib/
    airtable.ts   — REST client for both Airtable bases
    apollo.ts     — Apollo emailer campaigns
    apify.ts      — Apify actor-runs with name + dataset enrichment
    gmail.ts      — OAuth refresh-token flow, threads list
    mock.ts       — fallback data when env vars are missing
    fetcher.ts    — server-side helpers that wrap all integrations
    types.ts
    utils.ts      — status → color palette, date helpers
```

## Adding to the Airtable schema

If you add fields, update the field-id map in `src/lib/airtable.ts` (top of file). Airtable field IDs are stable; names aren't, so we use IDs.
