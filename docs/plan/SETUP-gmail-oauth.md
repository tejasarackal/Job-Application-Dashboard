# Setup — Gmail OAuth refresh token (server-side, draft-only)

**Why:** the dashboard's Gmail workflows (sync Applications/Interviews; create outreach drafts)
run **server-side on Vercel** with no interactive login. That requires a long-lived OAuth
**refresh token** the server exchanges for short-lived access tokens at call time.

**Scope we use: `https://www.googleapis.com/auth/gmail.modify` — and only that.**
`gmail.modify` can **search, read, label, and create drafts** but **cannot send** — Gmail's
`messages.send` is *not* authorized by `modify`. This enforces the draft-only policy at the token
layer: even a bug can't send mail. (We deliberately avoid `gmail.compose`, which *can* send.)

You end up with three env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.

---

## Steps

### 1. Create / select a Google Cloud project
console.cloud.google.com → project dropdown (top) → **New Project** (e.g. `job-dashboard`) → select it.

### 2. Enable the Gmail API
APIs & Services → **Library** → search **"Gmail API"** → **Enable**.

### 3. Configure the OAuth consent screen
APIs & Services → **OAuth consent screen**
- User type: **External** → Create
- App name + your email (user support + developer contact) → Save & continue
- Scopes: you can skip here (we request the scope at auth time) → Save & continue
- **Test users: click "+ Add users" and add your job-search Gmail address** (e.g. `tejasarackal90@gmail.com`) → Save. **Mandatory** — in Testing mode an account *not* on this list is hard-blocked with "Access blocked … Error 403: access_denied" and **no "Advanced" bypass appears.** In the newer console this is under **OAuth consent screen → Audience → Test users**. Add it in the **same project** that owns your OAuth client.
- Publishing status: see **§ Token longevity** below

### 4. Create OAuth client credentials
APIs & Services → **Credentials** → **Create Credentials** → **OAuth client ID**
- Application type: **Web application**
- **Authorized redirect URIs** → Add URI: `https://developers.google.com/oauthplayground`
- Create → copy **Client ID** and **Client secret**

### 5. Mint the refresh token (OAuth Playground)
Go to **developers.google.com/oauthplayground**
- Click the **⚙ gear** (top-right) → check **"Use your own OAuth credentials"** → paste Client ID + Client secret
- Left panel **Step 1**, in **"Input your own scopes"** paste exactly:
  ```
  https://www.googleapis.com/auth/gmail.modify
  ```
- Click **Authorize APIs** → sign in with your job-search Gmail → on the "Google hasn't verified this app" screen click **Advanced → Go to {app} (unsafe)** (it's your own app) → **Allow**
- Back in the Playground, **Step 2** → click **Exchange authorization code for tokens**
- Copy the **Refresh token** (starts with `1//…`)

### 6. Store the three values
Add to **Vercel → Project Settings → Environment Variables** (scope: Production; add Preview/Development too if you want `vercel env pull` to verify locally), and to `app/.env.local`:
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=1//...
```

### 7. Verify
Run the credential health check (see `IMPLEMENTATION-workflow-engine.md` → Verifying credentials).
Gmail should report `ok` with your email address.

---

## § Token longevity (important)
- **Testing** publishing status (External): refresh tokens **expire after 7 days** → you'd re-mint weekly.
- For a **non-expiring** token: OAuth consent screen → **Publish app** (status → *In production*).
  Because `gmail.modify` is a *restricted* scope, Google shows "needs verification" warnings; as the
  **sole owner/user** you can still publish and use it (click through the unverified-app screen once at
  authorize time). Formal verification is only enforced when distributing to *other* users — not for a
  single-user personal tool.
- The dashboard's credential health check surfaces a dead Gmail token immediately, so you'll know to re-mint.

## Troubleshooting
- **"Access blocked … has not completed the Google verification process / Error 403: access_denied" with NO "Advanced" link:** the signing-in account isn't a **Test user**. Fix: OAuth consent screen → **Audience → Test users → + Add users** → add that exact Gmail → Save → retry. (Must be the same project as your OAuth client.) Once added, the "Google hasn't verified this app → Advanced → Go to … (unsafe)" bypass appears.
- **No refresh token returned:** revoke prior access at myaccount.google.com/permissions, then re-do
  Step 5 (the Playground requests `access_type=offline` + `prompt=consent`, which forces a refresh token).
- **`invalid_grant` on refresh:** token expired (7-day testing rule) or revoked → re-mint (Step 5) or publish to production (§ longevity).
- **403 `insufficientPermissions`:** the minted token used the wrong scope — re-mint with exactly `gmail.modify`.
