# Deploy to Vercel

You have two paths. Pick whichever you prefer.

## Path A — CLI (fastest, ~2 minutes)

From the `app/` folder:

```bash
cd "Job Application Dashboard/app"
npm install
npx vercel login            # if you haven't already
npx vercel link             # connects this folder to a new or existing Vercel project
npx vercel --prod           # builds + deploys
```

When `vercel link` prompts you:

- **Scope:** select **Tejas Arackal's projects** (`team_4IeLgkmcM9kOuQ5OOAv1Hd00`).
- **Existing project?** No — create a new one called `job-application-dashboard` (or reuse `job-outreach-portal` if you'd rather).
- **Directory:** `.` (current).

After the first deploy you'll get a URL like `https://job-application-dashboard.vercel.app`. It'll render with mock data until you set env vars.

## Path B — GitHub + Vercel git integration

1. `cd "Job Application Dashboard/app"`
2. `git init && git add . && git commit -m "Initial commit"`
3. Create a GitHub repo and push (`gh repo create job-application-dashboard --private --source=. --push` if you have the GH CLI).
4. In Vercel: New Project → Import from GitHub → select the repo → keep defaults → Deploy.

## Set environment variables (do this after first deploy)

Either via the dashboard (Project → Settings → Environment Variables) or the CLI:

```bash
# Airtable (required for live data)
vercel env add AIRTABLE_TOKEN production

# Optional — defaults are correct, only set if you fork the bases
vercel env add AIRTABLE_BASE_ID production           # app8aBP9UPmxYaEgI
vercel env add AIRTABLE_LEADS_BASE_ID production     # appkusCXgR7KcEmLO

# Apify (optional — shows scrape health card)
vercel env add APIFY_TOKEN production

# Apollo (optional — shows sequence stats)
vercel env add APOLLO_API_KEY production

# Gmail (optional — shows thread snippets)
vercel env add GOOGLE_CLIENT_ID production
vercel env add GOOGLE_CLIENT_SECRET production
vercel env add GOOGLE_REFRESH_TOKEN production
vercel env add GMAIL_LABEL_ID production             # Label_3
```

Then redeploy:

```bash
vercel --prod
```

The "Live" / "Mock" pill on each card tells you which sections are reading real data.

## Getting the credentials

### Airtable

1. https://airtable.com/create/tokens → Create a new token.
2. Scopes: `data.records:read`, `schema.bases:read`.
3. Workspaces/Bases: add **both** "Job Outreach" and "Automation Dev Outreach".
4. Copy the `pat...` token into `AIRTABLE_TOKEN`.

### Apify

https://console.apify.com/settings/integrations → copy your API token.

### Apollo

Apollo settings → Integrations → API → copy the key.

### Gmail

You need a refresh token with the `gmail.readonly` scope. Easiest one-shot:

1. https://console.cloud.google.com → create a project → OAuth client (Desktop app).
2. Use OAuth Playground (https://developers.google.com/oauthplayground) with your own client ID/secret to exchange for a refresh token. Select scope `https://www.googleapis.com/auth/gmail.readonly`.
3. Copy `client_id`, `client_secret`, and `refresh_token`.

Total time for all credentials: ~15 minutes.
