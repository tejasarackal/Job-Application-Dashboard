# PRD — Multi-User Accounts, Profiles & Data Isolation

**Owner:** Tejas Arackal · **Authors:** 7-role agent panel (PM, TPM, backend dev, frontend dev, data engineer, visualization specialist, brand specialist) — 2 review rounds (security red-team CR-S1–25, PM scope CR-P1–12, engineering consistency CR-E1–12), TPM tie-breaks T1–T8, PM sign-off **APPROVED-WITH-CHANGES** (C1–C4 folded in below)
**Last updated:** 2026-06-10 · **Scope:** MVP (M0–M3) + roadmap (P2–P4) · **Status:** Locked spec — implementation not started (tracker: `IMPLEMENTATION-multi-user.md`)

---

## 1. Context & Problem

The dashboard is a **single-user product wearing a multi-user costume**. It looks like a SaaS app — pages, API routes, a header avatar — but every layer assumes exactly one human:

- **No auth, anywhere.** No next-auth, no middleware, no session concept. Every page and every API route — including the mutating review routes and workflow triggers — is open to anyone with the URL. The only credential is the *optional* `CRON_SECRET`. Today, "security" is URL obscurity.
- **Identity is hardcoded.** The avatar is a non-clickable "TA" div (`Header.tsx:31-36`). Bio/voice/location live as TS constants (`knowledge.ts`); job preferences as a DE-title regex + 42 Bay-Area cities + match weights (`filters.ts`); the target universe is a baked-in ~101-company H1B registry (`company-registry.ts`). There is no Users table to put a second person in.
- **Data is untenanted.** Neither Airtable base has an owner field on any table. One server token reads everything, and **Airtable has no row-level security** — the moment two users exist, isolation is 100% application code or it doesn't exist at all.
- **The engine acts as one person.** Gmail sync/drafting run on Tejas's refresh token (`gmail.modify`); crons run his pipeline. Multi-user automation is a different, much harder product — explicitly *not* this MVP (D11).

**Why now:** the owner wants the dashboard open to other job-seekers via Google sign-in with **open signup**. That converts the gaps above from theoretical to urgent: an open front door on an untenanted database is not shippable.

**The trust requirement is the spine of this PRD.** A job-search pipeline is intimate data — where someone applied, who rejected them, what they wrote to strangers, their visa constraints. The owner's words: *"no security breach of data — utmost importance."* Because Airtable cannot enforce isolation for us, every read and write path must be tenancy-aware **by construction** (compiler-forced `userEmail` params, ownership asserts, runtime fail-closed guards, source-scan guardrail tests) — the same enforce-in-code-not-prompts discipline this codebase already applies to draft-only and the human gates.

---

## 2. Scope

### In scope (MVP)

| Cluster | Deliverable |
|---|---|
| **Auth shell** (R-1) | NextAuth v5 Google sign-in, JWT sessions ≤24h; `middleware.ts` default-deny (exempt: `/login`, `/privacy`, `/terms`, `/api/auth/*`, `/api/cron/*`, `/api/health/*`); separate GCP OAuth client (`openid email profile` only); engine Gmail creds untouched |
| **M0 hardening** | Delete the 8 verified-dead unauthenticated GET routes; `CRON_SECRET` mandatory fail-closed; CSRF (SameSite=Lax + origin check + JSON content-type); `callbackUrl` validation; Airtable PAT scoped to 2 bases, records-only; mock data never in production |
| **Open-signup safeguards** | `AUTH_DISABLE_SIGNUP` kill-switch; `USER_CAP=10`; optional `AUTH_REQUIRE_APPROVAL` (default off); per-user `Account Status` disable lever; members get **zero** automation |
| **Tenancy + isolation** (R-4) | `Users` table; `User Email` column on 6 tables (both bases); every owned-table read requires `userEmail` + `filterByFormula` + in-code post-filter; runtime throw on unfiltered owned-table reads; `assertOwnership()` before every mutation; guardrail tests |
| **Onboarding** (R-3) | First-login 3-step wizard (profile → targets mode → review), single submit; blocks app access until complete; Tejas seeded from `knowledge.ts`/`filters.ts` constants — he never sees the wizard |
| **Profile** (R-2) | Avatar becomes a session-driven user menu; `/profile` with editable identity, job-preference, voice/about, and account cards |
| **Per-user targets** (R-5) | Hybrid model: H1B master list shared; per-user mode flag + sparse deviation rows; opt-out button; custom companies (visible, automation-excluded until admin-verified) |
| **Member manual tracking** | Create + edit (no hard delete; status-archive) on the member's own listings/applications/interviews/outreach, with compute-on-save match % against *their* prefs. Without this a member's dashboard is permanently empty |
| **Admin back-channel** (R-7) | `/admin` user table; strictly read-only, audit-logged "view as user"; per-user disable/enable |
| **Migration** | Additive schema + idempotent chunked backfill of all existing rows to `OWNER_EMAIL`; auth ships before any per-user data exists (no open window) |

### Out of scope (deferred)

- **Any automation for members** — no scraping, Gmail sync, research, drafting, or cron work for anyone but the owner (Phase 3).
- **Per-user Gmail OAuth + encrypted token storage** — Phase 3, with quotas and (likely) Vercel Pro.
- **Sharing the owner's scraped-listings pool with members** — top Phase-2 candidate, but it bends strict isolation; needs an explicit owner call (§14 Q10). MVP is strict isolation, full stop.
- **Getting-started checklist card, per-step onboarding save, cross-user admin charts, audit-log viewer UI, self-serve account deletion, in-app signup toggles** — Phase 2+.
- **Email allowlist / invite codes** — signup is open by owner decision; compensating controls only.
- **Postgres + RLS, billing/tiers, multi-admin** — Phase 4. **Sending email — never.** Unchanged, forever.

### User stories

| # | Persona | Story | MVP? |
|---|---|---|---|
| U1 | Signed-out visitor | Any URL → `/login`; nothing — page or API — leaks data before sign-in | ✅ |
| U2 | New member | Google sign-in → 3-step onboarding → my own empty, private pipeline | ✅ |
| U3 | New member | I manually log listings/applications/interviews/outreach; my funnel and match scores reflect only my rows, scored against my preferences | ✅ |
| U4 | New member | My Targets page starts as the full H1B sponsor list; I opt out or prune/add companies; edits affect only me | ✅ |
| U5 | Any member | Avatar → Profile; all my info and preferences are editable and persist | ✅ |
| U6 | Member | Run scrapers / Gmail sync / drafting for myself | ❌ Phase 3 |
| U7 | Owner/admin | My data, workflows, crons, review gates, Gmail drafting work exactly as today, now attributed to my account | ✅ |
| U8 | Owner/admin | I list users, open read-only view-as (audit-logged), and disable an account in one click; I cannot mutate their data from view-as | ✅ |
| U9 | Owner/admin | One env flip freezes signups if abuse appears | ✅ |

### The MVP cut — stated bluntly

**Members get:** Google login · onboarding · editable profile · strictly isolated views of their own pipeline · manual create/edit on those rows · per-user targets seeded from the H1B list · per-user match scores.
**Members do NOT get:** scraping, Gmail sync, research, drafting, crons, or anything that spends Apify/Apollo/Anthropic money or touches a Gmail account.

> **Positioning (binding on all copy, README, and any future marketing).** For new members this is a private, structured job-search tracker: sign in with Google, set preferences, keep a personal target-company list seeded from verified H1B sponsors, and manually track applications, interviews, and outreach with strict per-user isolation. Automation — scraping, Gmail sync, research, drafting — remains admin-only in this phase and must not be presented as a member feature anywhere. The H1B list reflects past sponsorship filings from public DOL data and is never described as a guarantee of sponsorship.

---

## 3. Decisions (locked) + rationale

| # | Decision | Alternatives rejected | Rationale |
|---|---|---|---|
| **D1** | NextAuth v5 (beta, exact-pinned), Google provider, JWT sessions, no adapter; `maxAge ≤ 24h` | DB-adapter sessions; Clerk/Auth0; NextAuth v4 | No session store fits the no-new-infra constraint; Users table holds app data, not sessions. 24h JWT bounds revocation lag; per-request Account-Status check (D4) closes the gap. v4 fallback documented if a beta blocker appears. |
| **D2** | Open Google signup; `USER_CAP=10`; optional `AUTH_REQUIRE_APPROVAL` env (default off) | Allowlist/invite; pending-approval default; cap of 3 | Locked-open by owner; member marginal cost ≈ 0 in MVP so a tight cap only manufactures lockouts. The approval env is a one-conditional incident lever that never changes default behavior. |
| **D3** | Admin = normalized `session.email === OWNER_EMAIL` env; **no Role column** | `Role` column with env bootstrap | A column that must agree with an env var is a split-brain privilege liability, editable from the Airtable grid. One admin exists; multi-admin = Phase-4 `ADMIN_EMAILS` env list. |
| **D4** | Per-request authorization: `requireUser` re-checks `Account Status` every request (30s cache OK); fail closed on missing/duplicate Users rows | Trust JWT claims for session lifetime | Disable must take effect in seconds, not at token expiry. Duplicate rows are a security anomaly, not a soft merge. |
| **D5** | Tenancy: shared Airtable schema; owned tables stamped `User Email`; reads require positional `userEmail` + `filterByFormula` + in-code post-filter; **runtime throw** if an owned-table read lacks a filter; explicit `*AllAdmin` variants | Per-user bases; Postgres now; cache-then-filter | Keeps the data layer and PAT model; the runtime guard makes "forgot the filter" a crash, not a leak; admin paths are deliberately loud in code review. |
| **D6** | Formula-injection defense: `escapeFormulaString` (backslash-first: `\\` then `\'`), reject `\r\n\0` + empty, shape-validate emails and `^rec[A-Za-z0-9]{14}$` before interpolation, `LOWER()` both sides | Raw interpolation; SQL-style quote-doubling | `filterByFormula` is this architecture's new injection surface. Quote-doubling is SQL/Excel semantics — Airtable string literals honor backslash escapes, so doubling leaves a trailing-`\` breakout (CR-S4/E5). |
| **D7** | Admin view-as: signed httpOnly cookie (HMAC `{adminEmail, target, exp ≤ 1h}` under `AUTH_SECRET`), POST/DELETE enter–exit with origin check, fresh admin re-verify per request, **all mutations 403 under view-as**, audit rows on enter + exit | `?viewAs=` query param; impersonated JWT | Query params leak (URLs/logs/bookmarks) and die on every `<Link>`; per-request audit writes are untenable at 5 rps. Read-only-by-construction: a page bug can never become a write as another user. |
| **D8** | Per-user targets: hybrid — `Users."Default Targets"` (`h1b_all\|none`) + sparse `UserTargets` deviation rows (`excluded\|added`); `effectiveTargets()` computed against the **live master count**; full-replace PUT diffed server-side | 101 materialized rows/user; JSON blob field | Sparse deviations keep records O(changes) not O(users × companies) (101×N exhausts caps; Free tier is already full today), master refreshes propagate automatically, and deviations stay admin-inspectable Airtable rows. |
| **D9** | Onboarding: 3-step wizard (Profile → Targets mode → Review), **single submit**, `Onboarding Status ∈ {pending, complete}`. Required: display name, ≥1 title keyword. Optional: **outreach email (prefilled with Google email — C1)**, locations, remote pref. Targets = `h1b_all`/`none` radio only (full editor at `/targets`). Min-match-score, sources, seniority excluded (dormant; seniority scores the *listing* title, not user prefs) | Per-step PATCH with 4-value cursor; full target editor in wizard; dormant pref fields | Resume support is overweight at cap 10 and a step cursor invites partial-state bugs; every shipped field has a live consumer (compute-on-save match %). |
| **D10** | Member experience: manual CRUD (create + edit, no hard delete, status-archive); compute-on-save match % via `matchScore(it, prefs = OWNER_PREFS)` — owner constants extracted in `filters.ts`, engine call sites and tests unchanged; **neutral defaults for members — never inherit the owner's Bay-Area prefs**; S0 = simple empty-state card + CTA; ratios render "—" when denominator < 5 | Getting-started checklist at S0; recompute-on-read; wrapper module forking the scoring logic | Members get a working tracker with honest metrics on day one; deterministic save-time scoring keeps reads cheap; one scoring implementation, not two. |
| **D11** | MVP automation boundary: engine, crons, Gmail, `/workflows`, `/outreach-review` are admin-only; engine executes as `OWNER_EMAIL` and refuses to run if it's unset; **the engine's knowledge loader prefers the owner's Users-row prefs (voice/about) with constant fallback (C2)** | Per-user Gmail OAuth/scraping in MVP | The 60s/2-cron Hobby budget and the single Gmail token are sized for one operator; multiplying them per-user is a re-architecture (Phase 3). C2 keeps `/profile` edits real for the owner without forking the engine. |
| **D12** | M0 hardening baseline: legacy unauthenticated GET routes **deleted**; CSRF = SameSite=Lax + origin check + JSON content-type on mutations; `callbackUrl` validated post-decode (`startsWith("/") && !startsWith("//") && !includes("\\")`); `CRON_SECRET` mandatory fail-closed (unset → 503) + timing-safe compare; PAT scoped to the 2 bases, `data.records` read/write only; mock fallback never in production; `/api/profile` strict zod allowlist (can never touch Status/Email/owner fields) | Gate-but-keep dead routes; `MULTIUSER` feature flag | Every item closes a concrete pre-existing or conversion-introduced hole; a migration flag doubles the test surface with no CI to cover it — ordering + the signup gate hold the invariant instead. |
| **D13** | Health endpoint split: public boolean-only `{ok, checks:{…}}`, `no-store`; detail + multiuser verification block (unstamped-row counts, upstream errors, Gmail identity) gated behind admin session OR `Bearer CRON_SECRET` | Fully gated; status quo (leaks owner email + error detail) | Preserves the uptime-ping use case at minimal disclosure; everything sensitive sits behind the two trusted principals that already exist. |
| **D14** | `Admin_Audit` table, five actions: `view_as_enter`, `view_as_exit`, `migrate_run`, `user_disable`, `user_enable` | Per-request view-as audit rows; `signup_toggle` action | Per-request auditing doubles Airtable traffic against 5 rps with a 30s 429 penalty; enter/exit + 1h TTL brackets every read. Signup controls are env-driven in MVP — no in-app site to instrument. |
| **D15** | Rollout M0 → M1 → M2 → M3 (§11); gates before signup opens: OAuth production consent (non-sensitive scopes), `/privacy`, `/terms`, **Airtable Team payment approved (C4 — M1 entry gate)**. H1B provenance: static "Source: US DOL LCA data, FY{year}", quarterly manual refresh, no dynamic date | Big-bang cutover; dynamic provenance dates | Each milestone is independently verifiable in prod (the only place secrets resolve); a static provenance line never lies about freshness it can't prove. |

---

## 4. Target Architecture

```
┌──────────────────────────── UNTRUSTED (browser) ─────────────────────────────┐
│ Query params, bodies, headers, cookies-as-values, localStorage = hostile.    │
│ The client holds ONE credential: the httpOnly, AUTH_SECRET-signed session    │
│ JWT cookie, which it cannot read or mint. Identity/role/filters NEVER come   │
│ from the client.                                                             │
└─────────────────────────────────────┬─────────────────────────────────────────┘
                                      │ every request
══════════════════ TRUST BOUNDARY ════▼═════════════════════════════════════════
┌──────────────────────── Vercel (server-only below) ───────────────────────────┐
│ middleware.ts (edge) — coarse wall: JWT signature/expiry only; no session →   │
│   redirect /login (pages) · 401 JSON (APIs). Matcher exempts ONLY /login,     │
│   /privacy, /terms, /api/auth/*, /api/cron/*, /api/health/*, _next, favicon.  │
│                                                                                │
│ session.ts — real enforcement (per request):                                  │
│   requireUser()/requireUserApi() → {email} + Account Status check (30s cache) │
│   requireAdmin*() → normalized email === OWNER_EMAIL (env; no table role)     │
│   getViewContext() (React cache(), 1×/request) →                              │
│     { sessionEmail, effectiveEmail, isAdmin, isViewAs }                       │
│     effectiveEmail ≠ sessionEmail ONLY when: valid signed viewas cookie       │
│     AND requireAdmin passes fresh. Mutations NEVER read effectiveEmail.       │
│                                                                                │
│ server components → fetcher.get*(effectiveEmail) → airtable.list*(userEmail)  │
│   → filterByFormula: LOWER({User Email})='<escaped>'  (cache keys per-user    │
│     because the email rides in the fetch URL)                                 │
│   → in-code post-filter by field ID (defense in depth; mismatch = alarm)      │
│   → AIRTABLE_TOKEN (server env only; scoped to 2 bases, records-only)         │
└────────────────────────────────────────────────────────────────────────────────┘

AUTH:    /login → Google OAuth (dedicated client, openid email profile)
         → signIn callback: email_verified strict → existing row? allow (+Last
           Login, throttled) : kill-switch → cap → create Users row (status per
           AUTH_REQUIRE_APPROVAL) — create failure ⇒ deny (fail closed)
         → JWT {email} → first login lands /onboarding; Tejas's seeded row
           (complete) skips the wizard.

VIEW-AS: POST /api/admin/view-as {email} (admin fresh-verified, origin-checked)
         → Admin_Audit view_as_enter → set signed viewas cookie (exp ≤1h)
         → full navigation (busts router cache) → banner + member-nav + reads
           as target; ALL mutating routes 403 while the cookie is present
         → DELETE clears + audits view_as_exit.

ENGINE:  Vercel Cron → /api/cron/[job] (CRON_SECRET mandatory; unset → 503)
         → drive.ts as OWNER_EMAIL (refuses to run unset) → every engine write
           stamps User Email = OWNER_EMAIL. Gmail refresh token stays owner-only.
```

**Invariant:** identity enters the system in exactly one place (Google → signIn → JWT) and is read in exactly one place (`session.ts`). Airtable has no RLS, so isolation is enforced twice in app code (formula filter + post-filter), crash-guarded at runtime (D5), and proven by source-scan tests (§9).

---

## 5. Auth & isolation specifications

### 5.1 NextAuth config (`app/src/lib/auth.ts`)
- `next-auth@5.0.0-beta.x` **pinned exact** (no `^`). Files: `auth.ts`, `session.ts`, `middleware.ts`, `app/api/auth/[...nextauth]/route.ts`.
- Google provider only, **new dedicated GCP OAuth client** (`AUTH_GOOGLE_ID/SECRET`), scopes `openid email profile`, no offline access. The engine's `GOOGLE_CLIENT_ID/SECRET/GOOGLE_REFRESH_TOKEN` (gmail.modify) are never touched or reused — two clients, zero scope overlap, so member sign-in never enters Google's sensitive-scope review queue.
- `{strategy:"jwt", maxAge: 86400}`; `AUTH_SECRET` required — module throws at load in production if unset. `__Secure-` cookie prefixes kept.
- **signIn callback:** reject `profile.email_verified !== true` (strict); normalize email (trim + lowercase); fresh-read Users row → existing: allow + best-effort throttled `Last Login` (a write failure must never lock out an existing user); none: deny if `AUTH_DISABLE_SIGNUP`; deny if active-user count ≥ `USER_CAP`; else create row (`Account Status` = `pending` if `AUTH_REQUIRE_APPROVAL` else `active`; `Onboarding Status=pending`). **Create failure ⇒ deny** — a session must never exist without a Users row. Post-create re-query: >1 row for one email ⇒ fail closed + flag.
- jwt/session callbacks expose `{email}` only. Role is never a JWT claim that authorizes anything (D3).

### 5.2 session.ts contracts
```ts
requireUser():     Promise<{email}>   // pages: redirect /login?callbackUrl=… ; not onboarded → redirect /onboarding
requireUserApi():  Promise<{email}>   // routes: throw AuthError → 401/403 JSON, never redirects
requireAdmin() / requireAdminApi()    // normalized email === OWNER_EMAIL (env), nothing else
getViewContext(): { sessionEmail, effectiveEmail, isAdmin, isViewAs }  // React cache(), once per request
assertWritable(ctx)                   // throws 403 when ctx.isViewAs — top of every mutating route
```
- All variants check `Account Status === "active"` (30s-cached Users read — disable propagates ≤ ~60s); `pending` (approval mode) renders a "pending approval" page.
- Layout/page gating is UX; **the API-side checks are the security control** (layouts don't re-run on soft navigation — every `(app)` page and member API route calls the helper itself).
- Email comparison everywhere: trimmed + lowercased, both sides; never dot/plus-canonicalized (CR-S11).

### 5.3 Route-gating matrix
Gates: **public** · **session** · **session+onb** (+ onboarding complete) · **admin** · **CRON**. Middleware additionally fronts everything not exempt. *Any route file absent from this matrix is a bug — the §9 scan fails the build.*

| Route | Method | Gate | Notes |
|---|---|---|---|
| `/login`, `/privacy`, `/terms` | page | public | login redirects signed-in users to `/` |
| `/onboarding` | page | session | is the gate; complete → redirect `/` |
| `/profile` | page | session | allowed pre-onboarding |
| `/`, `/listings`, `/applications`, `/interviews`, `/outreach`, `/targets` | page | session+onb | scoped to `effectiveEmail` |
| `/workflows`, `/outreach-review`, `/admin` | page | admin | absent from member nav, not just 403'd |
| `/api/auth/[...nextauth]` | * | public | signup policy enforced inside signIn |
| `/api/profile` | GET/PATCH | session | self-row by session email only; strict zod allowlist; record id never accepted from client |
| `/api/targets/user` | GET/PUT | session | full-replace PUT, server-diffed to deviations (§6.4); rows stamped server-side |
| `/api/listings` (new), `/api/applications`, `/api/interviews`, `/api/outreach` | POST | session+onb | member create; owner stamped server-side; compute-on-save scoring on listings |
| `/api/listings/[id]` (exists) + sibling member edit routes | POST/PATCH | session+onb | `assertOwnership` before `updateRecords`; sibling-collapse ids must come from the owner-filtered list |
| `/api/review/lead`, `/api/review/draft` | POST | admin | + `assertOwnership` + `assertWritable` (never under view-as — CR-S17: draft approval writes into the owner's mailbox) |
| `/api/workflows/[name]` | POST | admin | executes as OWNER_EMAIL |
| `/api/admin/users` | GET | admin | user list + per-table row counts |
| `/api/admin/view-as` | POST/DELETE | admin | sets/clears signed cookie; audits enter/exit; origin-checked |
| `/api/admin/migrate` | POST | admin | idempotent chunked backfill (§6.6); audits `migrate_run` |
| `/api/cron/[job]` | GET | CRON | mandatory secret; unset → 503; timing-safe compare |
| `/api/health/credentials` | GET | public booleans / gated detail | D13 |
| ~~`/api/airtable/*` (5), `/api/gmail/threads`, `/api/apify/runs`, `/api/apollo/sequences`~~ | — | **DELETED in M0** | verified zero callers; today they are unauthenticated full-table dumps (CR-S6). Re-verify callers at implementation; any with a real caller becomes admin-gated instead |

### 5.4 airtable.ts isolation spec
- `fetchAllRecords` gains `opts.filterByFormula`; **throws** if called for an owned table without one (D5 runtime guard). Owned set: jobListings, applications, interviews, outreach, leads, workflowRuns. Unowned/shared: h1bCompanies, scrapeTargets, users (keyed reads), userTargets (always user-filtered), adminAudit.
- Every owned-table `list*` takes **required positional `userEmail: string`** — `npm run build` fails until every call site (fetcher, pages, workflows, review routes, cron drive) passes an identity. Each sends `LOWER({User Email})='<escaped>'` AND post-filters mapped rows by field ID (normalized compare); a post-filter mismatch **alarms** (logged as a security anomaly), not just drops.
- Cross-user reads exist only as `list*AllAdmin()` variants whose call sites must co-occur with `requireAdmin` (scan-enforced).
- ```ts
  export function escapeFormulaString(v: string): string {
    if (v === "" || /[\r\n\0]/.test(v)) throw new Error("invalid formula value");
    return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");   // backslash FIRST
  }
  ```
  Empty-string throw is load-bearing: `{User Email}=''` matches every blank-owner row (CR-S5). Shape-validate before escaping: emails (RFC-lite regex), record ids (`^rec[A-Za-z0-9]{14}$`) — ids are interpolated in `assertOwnership` and are client-supplied (CR-S3).
- `FIELD_NAMES` constant pins the two formula-referenced names (`"User Email"`, Users `"Email"`); these columns are **frozen** in Airtable (a rename fails closed to empty — the gated health detail probes them so a rename surfaces as a named failure, not a silent outage).
- `assertOwnership(table, baseId, userEmail, recordIds)`: fresh `no-store` read filtered `AND(OR(RECORD_ID()=…), owner)`; throws 404 unless **every** id is owned — missing and other-owned are indistinguishable (no existence oracle). Called with `sessionEmail`, never `effectiveEmail`. `withOwner()` stamps `User Email` on every create; client-supplied owner values ignored.
- New `deleteRecords` helper (≤10/req) — used only by the server-side targets diff; member pipeline rows are never hard-deleted in MVP.
- **Mock rule:** `fetcher.ts#wrap` may return `source:"mock"` only when `NODE_ENV !== "production"` AND Airtable is unconfigured. In production, a failed read for a signed-in user returns `{ok:false, data:<empty>, error}` → empty table + error banner. Fixture data rendering inside another user's session is indistinguishable from a breach (CR-S7).
- Single shared `AIRTABLE_TOKEN` is the accepted residual risk (R1): scope it to the two bases with `data.records:read/write` only — no schema scopes; client-facing errors are generic, full detail to server logs.

### 5.5 Admin view-as
- Enter: `/admin` row action → confirm dialog ("Read-only; this access is logged") → `POST /api/admin/view-as {email}` → fresh `requireAdminApi` + target-row existence check → `Admin_Audit` `view_as_enter` (**write fails ⇒ entry denied**) → set `viewas` cookie: httpOnly, Secure, SameSite=Lax, Max-Age 3600, value = HMAC-signed `{adminEmail, target, exp}` under `AUTH_SECRET` → `window.location.assign("/")` (full navigation busts the client router cache; no stale RSC payload from the other identity).
- Per request: `getViewContext()` honors the cookie only if signature + exp valid AND `requireAdmin` passes fresh. Members sending a forged/stolen cookie get their own data, silently.
- Read fidelity: pixel-faithful member view — member-role nav and module rules apply (admin-only cards stay hidden), banner above TopNav: *"Viewing as {email} — read-only. All changes are disabled."* + Exit. Mutation affordances hidden in UI; **`assertWritable` in every mutating route is the guarantee** (403 `read-only: view-as session`).
- Exit: `DELETE /api/admin/view-as` → audit `view_as_exit` → clear cookie → full navigation to `/admin`. Cookie expiry without exit is bounded by the enter row + 1h TTL.

### 5.6 Engine & cron identity
- `drive.ts`/`execute.ts` resolve `OWNER_EMAIL` at entry; missing → run row `failed`, note `OWNER_EMAIL unset` — no ownerless rows ever. All engine reads call `list*(OWNER_EMAIL)`; all engine writes stamp it.
- `api/cron/[job]`: secret unset → 503 (misconfiguration ≠ open door); wrong/absent bearer → 401; timing-safe compare. The current "open if unset" branch is deleted.

---

## 6. Data-model changes

All changes are **additive** — no existing column is renamed, retyped, or removed. New tables live in the primary base (`app8aBP9UPmxYaEgI`). House pattern unchanged (field IDs via `TABLES`/`FIELDS`, `typecast:true`, batches ≤10) with one deliberate exception: `filterByFormula` uses pinned field **names** (§5.4).

### 6.1 New table: `Users`

| Field | Type | Options | Purpose |
|---|---|---|---|
| Email | Single line text | — | **PK/FK everywhere.** Lowercased + trimmed at every boundary; uniqueness enforced in code (fresh-read upsert, fail-closed on duplicates) |
| Name | Single line text | — | Display name (prefilled from Google); owns the datum — never duplicated in Preferences |
| Auth Sub | Single line text | — | Google `sub`, write-once at first sign-in; forensic anchor for email-change re-keying (never used as a key) |
| Account Status | Single select | `active` \| `pending` \| `disabled` | Kill switch + approval mode; checked on every request (D4) |
| Onboarding Status | Single select | `pending` \| `complete` | The wizard gate (D9) |
| Default Targets | Single select | `h1b_all` \| `none` | The hybrid-targets baseline (D8); the opt-out button writes this one field |
| Preferences | Long text | JSON, `UserPrefs` v1 | §6.2; size-guarded < 90k chars |
| Created At | Created time | — | Airtable-computed |
| Last Login | Date+time | — | Written by code, throttled once/UTC-day, fire-and-forget |

**Why email-as-PK:** uniform across both bases (links can't span bases), present in the JWT with zero lookups, human-readable in every grid, already the house identifier. Record IDs can't reach the leads base and don't survive base clones; Google `sub` is collision-proof but opaque — kept as a column, not the key. Email-change = admin-mediated re-key (same chunked machinery as the §6.6 backfill); Gmail never recycles consumer addresses — residual risk accepted and detectable via `Auth Sub` mismatch (block + flag).

### 6.2 `UserPrefs` JSON schema (`lib/prefs.ts`, zod-validated, versioned)

```ts
interface UserPrefs {
  v: 1;
  identity: { outreachEmail?: string };          // C1 — captured in onboarding step 1, editable on /profile
  jobPrefs: {
    titleKeywords: string[];                     // plain substrings; regex-escaped before alternation —
                                                 // user input NEVER compiles into a raw regex
    locations: string[];                         // empty = neutral "anywhere"
    remotePref: "remote_only" | "onsite_ok" | "no_preference";
  };
  voice?: string;                                // outreach voice rules — editable on /profile (C2)
  about?: string;                                // bio block — editable on /profile (C2)
}
```
- **Defensive parse** (`getUserPrefs`): JSON.parse + `safeParse`, unknown keys stripped; any failure → log + `neutralDefaults()` (empty voice/about, neutral location). **Never** fall back to `tejasDefaults()` for a non-owner — his bio leaking into another user's context is its own breach class.
- **Tejas's seed (`tejasDefaults()`):** `voice`/`about` verbatim from `knowledge.ts` `VOICE`/`ABOUT`; `titleKeywords` = the DE family from `filters.ts#DE_TITLE_RE`; `locations` = the 42-city `ACCEPTABLE` list; `remotePref` per current behavior; `outreachEmail` = `OWNER_EMAIL`.
- **Stays global code (not preferences):** matchScore weights (45/20/20/15) + actor blend, `INTERN_RE`, `FOREIGN_RE`, dedup mechanics (`canonicalJobKey`/`canonicalUrl`/`roleKey`), `normalizeCompany`, `shouldAdvance`, and the H1B registry — correctness/integrity mechanics, not preferences.
- **Scoring:** owner literals extracted to `OWNER_PREFS` in `filters.ts`; `matchScore(it, prefs = OWNER_PREFS)` / `checkLocation(loc, prefs = OWNER_PREFS)` — engine call sites pass nothing (behavior-identical, existing tests unchanged and now pin the default path). Member scoring uses `prefsOrNeutral()`: missing locations → location-neutral 12/20 (never the owner's Bay-Area lists); missing keywords → title 0 + UI nudge. Phase-2 schema additions (documented, not built): `minMatchScore`, `sources`, seniority pref.

### 6.3 Ownership columns
`User Email` (Single line text, lowercased; **name frozen**) added to: `jobListings`, `applications`, `interviews`, `outreach`, `workflowRuns` (primary base) and `leads` (leads base). Backfill value: `OWNER_EMAIL`. *Not* added to `h1bCompanies`/`scrapeTargets` (shared masters, unowned by design). New `fld…`/`tbl…` IDs land in `TABLES`/`FIELDS` before the M2 deploy; the formula names land in `FIELD_NAMES`.
Plain text, not linked records: links can't span bases (leads), links need record-ID lookups on every write (defeats `typecast` create-on-write), text equality in formulas is exact, and the email is already in the JWT. Performance: filterByFormula is a server-side scan — at 50 users × ~200 listings = 10k rows, a filtered read returns ~2 pages (~400–800 ms); fine. The critical inversion: **server-side filtering is mandatory, not an optimization** — `fetchAllRecords` caps at 10 pages/1,000 records, so unfiltered-read-then-post-filter silently truncates and cannot be the primary mechanism.

### 6.4 New table: `UserTargets` (sparse deviations only — D8)

| Field | Type | Options / notes |
|---|---|---|
| User Email | Single line text | |
| Company Key | Single line text | = master `normalizeCompany` name (or slug of custom name); uniqueness on (User Email, Company Key) enforced in code |
| Status | Single select | `excluded` \| `added` |
| Company Name | Single line text | added rows only (display) |
| Careers URL | URL | added rows only (ATS-resolution hint) |
| H1B Verified | Checkbox | added rows only; **admin-set, never user-set**; default false |
| Created/Updated At | Created time / Last modified | Airtable-computed |

- `effectiveTargets(user) = (DefaultTargets==="h1b_all" ? MASTER : ∅) − excluded + added`, where MASTER = the **live H1B_Companies table at read time** (never the literal 101 — the registry currently holds 100 entries and the table is editable).
- **API:** `PUT /api/targets/user` stays full-replace for the client (`{defaultMode, selections:[{companyKey, enabled}], custom:[{name, careersUrl?}]}`); the server diffs desired vs existing deviations and batch-creates/deletes/patches (worst case ≈ 10 requests). Onboarding's default path writes **zero** target rows (one Users PATCH).
- **Opt-out semantics (R-5):** the button = one PATCH (`Default Targets → none`); existing exclusions persist inert (flipping back restores prior curation exactly); the UI collapses the list immediately and offers the `h1b_all` radio as undo. Per-company toggle = one deviation row (copy-on-write).
- **Custom companies (C3):** visible in the member's dashboard and manual tracking; **excluded from all proactive automation** (scrape/research) until the admin checks `H1B Verified` — the workspace H1B guardrail is never delegated to user input. UI badge: "pending verification" with honest copy. Cap: ≤50 custom/user. No ATS metadata until a detect-boards-style resolution (Phase 3).
- Profile summary is computed, never literal: `Targeting {N−excluded} of {N} sponsors · {added} custom`.

### 6.5 New table: `Admin_Audit` (not workflowRuns reuse — different lifecycle, append-only)

| Field | Type | Notes |
|---|---|---|
| Actor Email | Single line text | |
| Action | Single select | `view_as_enter` \| `view_as_exit` \| `migrate_run` \| `user_disable` \| `user_enable` (D14) |
| Target Email | Single line text | |
| At | Date+time | server clock |
| Note | Long text | optional (e.g., route summary on exit) |

### 6.6 Migration & backfill runbook
Pre-step: Airtable base snapshots (both bases).
1. **Schema** (Airtable UI/MCP; no code): create Users/UserTargets/Admin_Audit with the exact single-select options above (pre-created — never minted via typecast from user input); add `User Email` to the 6 tables; capture all `tbl…`/`fld…` IDs.
2. **Code:** IDs into `TABLES`/`FIELDS`/`FIELD_NAMES`; ships inside the single atomic M2 deploy (§11).
3. **Backfill** — `POST /api/admin/migrate` (admin-gated via OWNER_EMAIL env — no bootstrap circularity since D3 has no table role): per invocation, page the cursor's table with `{User Email}=''` (a deliberate, internal-only blank-filter use), PATCH blank rows only → `OWNER_EMAIL` in ≤10 batches, return `{table, cursor, more, patched, scanned}`; chunk-loop client-side (RunButton pattern; ~1,000 rows ≈ 100 PATCHes across invocations). Final chunk: upsert Tejas's Users row from `tejasDefaults()` (`Account Status=active`, `Onboarding Status=complete`, `Default Targets=h1b_all`, **zero UserTargets rows**) + audit `migrate_run`.
4. **Verify** via the gated health detail block: blank-owner count per table = 0; owner-stamped counts match scanned totals; Users has exactly one row passing the zod parse; formula-name probe succeeds on all 6 tables; `effectiveTargets(owner)` count == live master count; guardrail suite green.
- **Idempotent** (blank-only predicate; re-runs are no-ops), cursor-resumable, fresh reads only. **Rollback:** everything is additive — `vercel rollback` restores prior behavior; never drop the columns/tables (they sit inert).

### 6.7 Scale & limits
- **Rate (5 rps/base):** a cold page load is a 4–6 request burst; 30s per-user cache absorbs repeats; honor 429s with backoff serving last-good data + "stale" banner (never fixtures). **MVP-acceptable: `USER_CAP=10` registered, ~5 concurrently active.** Before raising: request coalescing / per-request batching; move `{fresh:true}` to mutation-adjacent reads only.
- **Records:** primary base sits at ≈ the Free 1,000-record cap **today** → **Airtable Team (50k) is an M1 entry gate (C4)**. Hybrid targets keep per-user cost O(deviations) (p95 ≈ 40 rows); MVP-shape usage survives to ~100+ users; Phase-3 per-user scraping survives to ~25 users for ~12 months.
- **Phase-4 trigger (Neon Postgres + RLS) — migrate when ANY of:** primary base > 35k records (70% of Team cap) or 90-day projection crosses it; sustained 429 rate > 1%/day; per-user engine scheduling required. Sketch: drizzle schema mirrors `TABLES`/`FIELDS` one-to-one (`user_email text not null` on owned tables) so typed accessors swap backends without touching callers; dual-write + nightly reconciliation, reads cut over table-by-table; isolation moves into the DB: `CREATE POLICY user_isolation ON job_listings USING (user_email = current_setting('app.user_email'))` bound per-request from the JWT.

---

## 7. UI / UX surfaces

House style throughout: white `Card` on `#f8f9fc` canvas, `#1f3bb3` primary, 13px body, `StatusBadge` enums, skeleton `loading.tsx` + `error.tsx` per the `outreach-review` pattern; minimal client islands (`fetch` JSON → inline error → `router.refresh()`).

### 7.1 Identity & naming (brand)
- **No rebrand.** Formal name "Job Application Dashboard" (OAuth consent screen, `<title>`, /privacy, /terms — lock it; renaming re-triggers Google brand review). Wordmark "JobDash" (existing TopNav markup) reused on `/login`. Net-new brand surfaces: `/login` + consent screen only.
- **Avatar:** Google photo → initials fallback (first letter of first + last word of Name; single word → first two letters; no name → first two chars of email local part; uppercased, max 2). 32px circle, brand-ink bg, white 12px semibold — one color for all users. Tooltip = full name, never the email. Admin gets no avatar badge — admin-ness shows only in nav and the view-as banner.

### 7.2 `/login`
Full-viewport centered card: JobDash wordmark · headline **"Your job search, in one place."** · subline "Track applications, interviews, outreach, and target companies in a private pipeline. Your data is yours alone." · `Continue with Google` (white, bordered, vendored G icon; NextAuth `signIn("google",{redirectTo})` with the D12-validated callbackUrl) · consent microcopy: *"Signing in shares your Google name, email address, and profile photo with this app. The app stores your profile, your job preferences, and the applications you choose to track — and nothing else. It never sends email on your behalf."* · legal line linking Terms + Privacy.
Error banner via `?error=`: `signups-disabled` → "Sign-ups are currently closed. Existing accounts can still sign in." · `user-cap` → "This instance has reached its user limit. Existing accounts are unaffected." · default → "Sign-in didn't complete. Nothing was saved — try again." Kill-switch copy is factual, never apologetic.

### 7.3 Route-group restructure + session-aware nav
Pages move (`git mv`, URLs unchanged, `@/` imports survive) into `(app)/`; `/workflows`, `/outreach-review`, `/admin` into nested `(app)/(admin)/` whose layout calls `requireAdmin()`. `/login`, `/onboarding`, `/privacy`, `/terms` live outside. The `(app)` layout resolves session + ViewContext + onboarding gate and renders `{ViewAsBanner?}+TopNav+children`; **every page and member API route also calls the session helper itself** (layouts don't re-run on soft nav — §5.2).
`TopNav` accepts `{isAdmin, isViewAs}` props (no SessionProvider): members and view-as sessions see exactly the six pipeline tabs; the automation group + Admin tab render only for `isAdmin && !isViewAs`. Hiding is cosmetic; the `(admin)` layout is the gate.
`Header.tsx` becomes async (calls `auth()`), replacing the hardcoded "TA" div with `<UserMenu name email image isAdmin/>` — client dropdown (Profile · Admin console (admin) · Sign out), `aria-haspopup="menu"`, Escape/arrow keys, click-outside close.

### 7.4 `/onboarding` — 3 steps, single submit (D9)
No TopNav; centered column; numbered-dot progress ("Step {n} of 3"). Buttons: `Continue` / `Back` / step 3 `Finish setup`. No skip escape hatch (the route gate makes it moot); Tejas never sees it (seeded complete).

| Step | Title + helper | Fields |
|---|---|---|
| 1 — `About you` ("Your name and how you reach out. This labels your workspace — it isn't shared with anyone.") | Display name (required, prefilled from Google, 1–80) · **Outreach email (optional, prefilled with Google email — C1)** · Title keywords (required ≥1, chip input, each 2–60, regex-escaped server-side) · Locations (optional chips) · Remote preference (pills: remote only / on-site OK / no preference; default no preference) |
| 2 — `Target companies` ("Start from {N} verified H1B sponsors, or start empty and build your own list.") | Radio: **Start with the H1B sponsor list** (default) vs **I don't need visa sponsorship — start with an empty list**; helper "fine-tune anytime at /targets". H1B explainer card: *"These companies appear in public US Department of Labor H1B disclosure data, meaning each has sponsored H1B workers before. Past sponsorship is not a guarantee — confirm sponsorship for each role directly with the employer."* + provenance line "Source: US DOL LCA disclosure data, FY{year}." |
| 3 — `Review` | Read-back of steps 1–2 · `Finish setup` → one `PATCH /api/profile` (fields + `Onboarding Status=complete`) → completion screen: **"You're set."** "Your dashboard starts empty. Add applications as you submit them — tracking is manual in this release." → `Go to dashboard` |

Validation: client checks gate Continue (inline 11px red helper text); server zod is authoritative (422 + `fieldErrors`). Cut from onboarding (Phase 2+): min match score, sources, seniority.

### 7.5 `/profile`
Five cards, `max-w-[860px]`, per-card Edit-mode toggle (view → inputs + Save/Cancel; shared field components with the wizard — one validation dialect against `PATCH /api/profile`; "Saved." in muted 11px on success):
1. **Identity** — avatar, name, outreach email.
2. **Job preferences** — title-keyword chips, location pills, remote pref.
3. **Voice & about (C2)** — two textareas; caption: *"Used when outreach drafting runs for your account — automation is currently admin-run."* The engine's knowledge loader prefers the **owner's** Users-row voice/about with constant fallback, so Tejas's edits here are real.
4. **Target companies** — computed summary ("Targeting {x} of {N} sponsors · {y} custom") + `Manage target companies →` (/targets — one editor, not two).
5. **Account** — email + "From your Google account.", Sign out; deletion: *"To delete your account, contact the administrator."* (self-serve = Phase 3; admin runbook in MVP).
Toast rules: save → `Saved.`; failure → `Couldn't save. Your changes are still on this page — try again.`

### 7.6 `/targets` — "My target companies" editor
New first card above the existing read-only reference table. One client component (`TargetCompanyEditor`), also not re-used in the wizard (wizard has the mode radio only).
- Mode radio (h1b_all / none) + the R-5 **opt-out button** (= select "none"; `window.confirm`; list collapses immediately; restore via the radio).
- Master list as a grouped checkbox table (sector groups with per-group select-all + "x of y selected", search filter, ATS badge, Bay-Area ✓); count pill `{selected}/{N}`; Select all / none.
- **Add company:** name (2–80) + optional careers URL → "Custom" group, orange badge **"pending verification"**, helper: *"Custom companies are tracked in your dashboard but are not scraped or researched automatically until they're verified."* (C3). Remove ×.
- Sticky save bar: dirty count + `Save targets` → `PUT /api/targets/user` (server diffs to deviations) → "Saved · {x} sponsors, {y} custom" → `router.refresh()`. `beforeunload` guard when dirty. Under view-as: selection renders read-only, controls hidden.

### 7.7 Member manual tracking (CRUD)
Create + edit forms for listings, applications, interviews, outreach (member's own rows only; owner stamped server-side; no hard delete — status archive). `/listings/new?company=X` server-rendered form (the per-target-row "+ Listing" quick action links here prefilled); `POST /api/listings` runs compute-on-save `matchScore(input, prefsOrNeutral(user))` and persists `matchPct` exactly as scraped rows do ("—" only when prefs/title/location make it incomputable; tooltip: "Scored against your preferences when the listing was saved"). Interviews CTA disabled until ≥1 application ("Log an application first").

### 7.8 Per-user visualization & empty states (viz)
- **Scoping rule:** every number on every page computes only from `effectiveEmail`-owned rows. `summarize()` stays a pure function — scoping lands in the reads that feed it.
- **KPI tiles (member):** Listings hint → "{tracked} tracked · {applied} applied" (not "new" — implies scraper inflow members don't have); reply-rate and %-rejected trend labels suppressed until denominator ≥ 5.
- **Role-conditional modules:** Scrape-health (Apify) and Apollo cards are admin-only — **hidden** for members, never rendered as permanent zeros. Admin's own `/` shows his own data + the two automation cards; cross-user visibility lives on `/admin` as a plain table (no charts in MVP).
- **Dashboard states:** S0 (`activity===0`): funnel card replaced by a simple empty-state card — headline + helper + `Add your first listing` CTA (checklist = Phase 2); never draw the funnel when Targets is the only nonzero stage. S1 (sparse, activity < 5): funnel renders; all derived percentages show "—" while denominator < 5 (a 0% from `pct()` conflates no-data with zero-rate). S2: current rendering. States computed server-side.
- **Per-page empty states** (fact → next manual action → one factual automation line, never "coming soon"): Listings — "No job listings yet. Add roles as you find them — automated scraping runs for admin accounts only in this release." · Applications — "No applications tracked. Add one when you submit your next application." · Interviews — "No interviews yet. They'll appear here when you log one against an application." · Outreach — "No outreach tracked. Log contacts manually — automated research and drafting are not enabled for member accounts in this release." · **Targets is never empty — it's the activation surface**: one-time dismissible banner "Your target list is ready — {N} verified H1B sponsors." + per-row "+ Listing".
- **View-as is pixel-faithful:** admin sees exactly what the member sees (member modules, member states, member-prefs match scores); the banner is the only difference; mutation affordances disabled.

### 7.9 `/admin`
`DataTable`: avatar+name · email · Account Status badge · Onboarding badge · last login (relative) · row counts ("L 142 · A 12 · O 31") · joined · actions: **View as** (hidden on own row) + **Disable/Enable** (one click; audits `user_disable`/`user_enable`). Empty state: "Only you so far. Users appear here after their first Google sign-in." Footer note: "View-as sessions are recorded (admin, target user, start/end)."

### 7.10 Voice rules (all product copy)
Sentence case everywhere; no exclamation marks; banned: unlock, supercharge, seamless, effortless, powerful, magic, journey, leverage, passionate, excited, delighted, innovative, empower, elevate; numbers over adjectives ("{N} verified H1B sponsors", "Step 2 of 3"); describe the tool, never the outcome (never implies a job or visa result; sponsorship claims always sourced + hedged); second person, active, present; errors state what happened / what's preserved / what to do next, no apologies; automation honesty — member-absent features are "admin-only in this release", stated once per surface, no implied timeline.

---

## 8. Integrations & credentials

| Env var | Purpose | When | Notes |
|---|---|---|---|
| `AUTH_SECRET` | JWT signing + view-as cookie HMAC | M0 | throw-at-load if unset in prod |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | **New** sign-in OAuth client | M0 | `openid email profile` only; never reuse the engine's Gmail client |
| `OWNER_EMAIL` | Single source of admin identity + engine execution identity | M0 | `tejasarackal90@gmail.com`; no Role column duplicates it |
| `AUTH_DISABLE_SIGNUP` | `1` = only existing Users rows may sign in | M0 (`=1`) → `=0` at M3 | kill-switch / incident brake |
| `AUTH_REQUIRE_APPROVAL` | optional: new signups land `pending` until admin activates | available M3, default off | T1 incident lever |
| `USER_CAP` | max registered users, enforced at signIn | M3 (`=10`) | raise = env change + redeploy |
| `CRON_SECRET` | bearer for `/api/cron/*` | exists; **mandatory fail-closed at M0** | also unlocks health detail |
| *(pre-existing, unchanged)* `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `AIRTABLE_LEADS_BASE_ID`, `APIFY_*`, `APOLLO_API_KEY`, `ANTHROPIC_*`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_REFRESH_TOKEN`, `GMAIL_LABEL_ID`, `NINJAPEAR_API_KEY` | engine/data credentials (owner's) | — | PAT re-scoped (D12); owner-credential surfaces admin-gated |

Services: **GCP** — two OAuth clients (sign-in vs engine Gmail), consent screen → production with homepage + `/privacy` URL (non-sensitive scopes ⇒ lightweight review; submit early in M1, it gates signup not development). **Airtable** — Team plan upgrade = M1 entry gate (C4; Free cap already consumed). **Vercel** — Hobby suffices for MVP (no per-member function/cron/LLM load); Pro is a Phase-3 prerequisite. Env changes require a redeploy; verify via the health endpoint.

---

## 9. Non-negotiable guardrails (enforced in code + `guardrails.test.ts`, not prompts)

Existing four, unchanged and re-asserted: **(1) never send** (no Gmail send path in `src`); **(2) human gate** (`api/review/draft` is the sole Gmail-draft writer); **(3) H1B allowlist source-scopes proactive work** — now extended: user-added custom companies are automation-excluded until admin-verified; **(4) idempotent + monotonic**.

New isolation guardrails, each with its source-scan assertion (same `allSource` style):

| # | Guardrail | Test |
|---|---|---|
| G5 | Every owned-table read declares its tenant | every owned `list*` matches `/\(userEmail: string/` and body contains `ownerFilter(` + `postFilterOwned(`; global readers do NOT take userEmail; `fetchAllRecords` contains the owned-table runtime throw |
| G6 | No unauthenticated route exists | every `api/**/route.ts` minus the literal-pinned exemptions (`api/auth/`, `api/cron/`, `api/health/`) contains `require(User\|Admin)Api(` |
| G7 | No mutation without ownership proof | files with `updateRecords(` also contain `assertOwnership(`; files with `createRecords(` contain `withOwner(`; engine files contain the `OWNER_EMAIL` stamp |
| G8 | Middleware fronts everything | `middleware.ts` exists; matcher equals the pinned canonical exemption regex — any drift fails |
| G9 | Mock never crosses the prod auth boundary | `mock` imported only by `fetcher.ts`; unit test: `wrap` never returns `source:"mock"` when `NODE_ENV==="production"` |
| G10 | View-as is read-only, structurally | no file containing `effectiveEmail`/`viewas` also calls `updateRecords(`/`createRecords(`/`createDraft(`; every mutating route contains `assertWritable(` |
| G11 | Engine identity is fail-closed | `drive.ts`/`execute.ts` contain the OWNER_EMAIL refusal; cron route contains the 503-on-unset branch and not the "open if unset" escape |
| G12 | Admin surface is gated, escape hatch loud | `api/admin/**` ⟹ `requireAdminApi(`; `list*AllAdmin(` call sites co-occur with `requireAdmin`; `createDraft` call sites are admin-gated (CR-S17) |
| G13 | No formula injection / record oracle | all formula interpolation flows through `escapeFormulaString` (+ shape validation); no raw single-record `GET …/rec…` fetch outside `assertOwnership` |

---

## 10. Key risks & mitigations

| R# | Risk | Sev | Mitigation | Retired |
|---|---|---|---|---|
| R1 | **Airtable has no RLS** — one token reads both bases; isolation is app code only; open signup raises exposure | Critical | D5/D6/D7 layering + runtime throw + G5–G13 tests + cap/kill-switch/disable levers + PAT scoping. **Accepted, documented residual**; remediation = P4 Postgres+RLS | P4 |
| R2 | Formula field-NAME coupling — an Airtable rename silently changes filter behavior | High | `FIELD_NAMES` pinned + frozen-column rule + health-detail probe per table (fails closed to empty, surfaced as a named health failure) | P4 |
| R3 | Hobby limits (60s, 2 crons) can't host per-user automation fan-out | High at P3 | Engine stays admin-only through P2; P3 hard-gated on Vercel Pro + fan-out design | P3 gate |
| R4 | Cost multipliers (Apify/Apollo/Anthropic per active user) | High at P3 | MVP: members trigger zero paid calls; P3 requires per-user quotas/BYO keys + spend monitors | P3 gate |
| R5 | Airtable rate (5 rps + 30s 429 penalty) & record caps under open signup | Med | Team upgrade (M1 gate); hybrid targets; per-user 30s cache; 429 backoff + stale-banner; USER_CAP=10 / ~5 concurrent; coalescing before any cap raise | P4 |
| R6 | Gmail identity is the owner's — any member-reachable Gmail path reads/writes the wrong mailbox | High | All Gmail surfaces admin-only + `assertWritable` + G12 createDraft gate; P3 = per-user OAuth + encrypted token store (never plaintext in Airtable) | P3 |
| R7 | NextAuth v5 beta churn | Med | Exact pin; JWT-only minimal surface; upgrades release-gated behind §13; v4 fallback documented | v5 stable |
| R8 | Deploy-sequencing windows (tenanted data behind open routes; required params vs un-backfilled data; env timing) | Critical during build | §11 strict order + invariant; env-before-code; one atomic isolation deploy; signup opens last; every rollback lever named per milestone | end of M3 |
| R9 | Admin back-channel is itself an attack surface (forged cookie, CSRF, demoted-admin staleness) | Med | Signed+HMAC cookie ≤1h, origin checks, fresh admin re-verify per request, audit-fail ⇒ deny, mutations 403, G10 | re-review P4 |
| R10 | Legacy open routes (today: unauthenticated dumps of both bases incl. lead emails + owner's Gmail threads) | Critical today | **Deleted in M0**; G6 prevents recurrence | M0 |
| R11 | No local/CI safety net — secrets resolve only in Vercel; every check is live | Med | Preview deploys with preview-scoped AUTH_* + second redirect URI; health endpoint; kill-switch/cap as standing rollback levers | standing |

---

## 11. Phased rollout

**Invariant (binding):** after M0 all routes require auth; until M3 only `OWNER_EMAIL` and explicitly hand-inserted Users rows can sign in; there is no deployed state in which a non-owner can read unstamped or unfiltered data. Env vars are always added before the deploy that reads them.

### M0 — Hardening + auth shell (app goes private; data unchanged)
1. Prep: create the sign-in OAuth client (prod + preview redirect URIs); write `/privacy` + `/terms`; submit consent screen for production. Stage env: `AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET`, `OWNER_EMAIL`, `AUTH_DISABLE_SIGNUP=1`; confirm `CRON_SECRET` set. Re-scope the Airtable PAT.
2. **Deploy 1:** NextAuth + middleware default-deny + `/login`; only OWNER_EMAIL can sign in; **delete the 8 legacy open routes**; CRON_SECRET fail-closed; CSRF + callbackUrl validation; health endpoint split.
3. Verify: signed-out → redirect/401 everywhere; cron 401/503 semantics; owner sees the identical dashboard.
*Rollback: `vercel rollback` → prior (public single-user) posture.*

### M1 — Schema (additive; owner-only audience) — **entry gate: Airtable Team payment approved (C4)**
4. Upgrade Airtable to Team. Create Users/UserTargets/Admin_Audit + `User Email` on 6 tables per §6.6; capture IDs.
*(Deployed M0 code ignores unknown fields — zero impact.)*

### M2 — Isolation + backfill + product surfaces (one atomic deploy; signup still off)
5. **Deploy 2 (atomic):** required-`userEmail` reads + post-filters + runtime guard; `assertOwnership`/`withOwner`; engine stamping + cron-as-owner; `escapeFormulaString` + `FIELD_NAMES`; migrate route; onboarding + profile + targets editor + member CRUD + admin/view-as + UserMenu + viz/empty states; owner-credential routes admin-gated; mock-prod rule. (Pre-backfill, owner's dashboard reads empty for minutes — fail-closed and cosmetic, since only the owner can sign in. Optional: pause the 2 crons for the window.)
6. Run the chunked backfill; verify via the gated health detail (§6.6 checklist) + owner parity (row counts match pre-migration).
7. **Two-account protocol:** hand-insert a test Users row (`active`), run §13C; then set it `disabled`.
*Rollback: `vercel rollback` to M0 build (unfiltered reads return — but only the owner is signed in); backfill is idempotent re-run.*

### M3 — Open the doors — **entry gates: §13C green; consent screen approved; /privacy + /terms live**
8. Set `AUTH_DISABLE_SIGNUP=0`, `USER_CAP=10` (+ optionally `AUTH_REQUIRE_APPROVAL=1` for a soft first week — owner call, §14 Q11) → redeploy.
*Rollback levers: env flip back (existing members keep working); per-user `Account Status=disabled`; full retreat = `vercel rollback`.*

### P2 — Read-side personalization
Per-user prefs drive views (per-viewer match recompute option, min-match-score + sources fields, getting-started checklist, per-step onboarding save if warranted); **shared listings pool** if the owner approves §14 Q10; admin audit viewer. Entry gate: MVP protocol green; UserPrefs schema frozen.

### P3 — Multi-user automation
Per-user Gmail OAuth (draft-only enforced per user) + **encrypted token store** (never plaintext in Airtable); per-user scraping from `effectiveTargets()` (custom companies enter ATS detection + admin H1B verification); per-user research/drafting using each user's voice/about; per-user Workflow_Runs attribution (column exists from M1); quotas + spend monitors. **Entry gates:** Vercel Pro; token-store design; quota design; cost model approved. Retires R3/R4/R6.

### P4 — Full suite
Neon Postgres + RLS migration (retires R1/R2/R5); multi-admin (`ADMIN_EMAILS`); billing/tiers; full admin console; self-serve deletion; formal audit review of the admin surface.

---

## 12. Success criteria

1. **(R-1)** Any unauthenticated request outside the exempt set is redirected/401 with zero data bytes (middleware-coverage test); any Google account can establish a session at M3 subject only to kill-switch/cap/approval.
2. **(R-3)** First-time users cannot reach any data page before completing onboarding; completion persists name, outreach email, title keywords, locations, remote pref, and targets mode in one submit. Tejas's first sign-in lands onboarded with prefs matching today's `knowledge.ts`/`filters.ts` values — zero re-entry, wizard never shown.
3. **(R-2)** The avatar is a functioning user menu; `/profile` shows every user datum — identity, job preferences, **voice/about**, targets summary — and all edits persist via `PATCH /api/profile` across reload and re-login; the owner's voice/about edits are honored by the engine's knowledge loader.
4. **(R-4)** With accounts A (owner) and B (member), each with seeded rows: no page, API response, or forged direct call from B ever returns or mutates an A-owned row — cross-tenant reads are empty/404, writes 403/404 with nothing changed; G5–G13 source-scan tests pass.
5. **(R-5)** A new member's `/targets` shows the full live H1B master active with **zero** deviation rows; the opt-out button collapses to custom-only in one action (undo via the mode radio); per-company and custom edits persist, are invisible to every other user, and custom companies are automation-excluded until admin-verified.
6. **(R-7)** Only `OWNER_EMAIL` reaches `/admin`; view-as renders the member's exact read-only view with enter+exit audit rows; mutations during view-as are 403; members get 403 on `/admin` and forged view-as state is ignored; disable takes effect within ~60s.
7. **(Safeguards)** `AUTH_DISABLE_SIGNUP=1` blocks new accounts while existing sessions work; signup N+1 past `USER_CAP` is rejected with the capacity message; with `AUTH_REQUIRE_APPROVAL=1` new accounts land pending and see the pending page.
8. **(Migration + regression)** Zero rows in either base have a blank `User Email`; all engine writes and both crons attribute to `OWNER_EMAIL`; owner's dashboard is identical pre/post migration; the entire pre-existing test suite (never-send, human-gate, H1B, dedup) passes unchanged.

---

## 13. Verification plan

### A. Unit + guardrail tests (`npm test` from `app/`)
1–9. The G5–G13 source-scan assertions (§9), each written to **fail before** its control exists and pass after.
10. `escapeFormulaString` vectors: `O'Brien` → `O\'Brien`; lone `\` → `\\`; **trailing `\`** (closing-quote attack); `\'` → `\\\'`; `' OR TRUE() OR '`; `'),{Role}='admin`; unicode ’; empty string throws; `\r`/`\n`/`\0` throw; round-trip integration fixture matches exactly one literal.
11. Record-id shape: `^rec[A-Za-z0-9]{14}$` rejected vectors including `x') , TRUE(), ('`.
12. signIn callback: kill-switch deny; cap deny; approval-mode pending; owner always admitted; create-failure deny; duplicate-row fail-closed.
13. `prefsOrNeutral`: malformed JSON → neutral (never `tejasDefaults` for non-owner); member with no locations scores location-neutral, never Bay-Area.
14. `tejasDefaults` parity snapshot vs `knowledge.ts`/`filters.ts` constants — drift fails the build.
15. `effectiveTargets`: h1b_all−excluded+added; none-mode; custom uniqueness; server diff idempotence.
16. View-as cookie: invalid signature/expired/member-presented → ignored; `assertWritable` throws under view-as.

### B. Build + deploy gate
`npm test && npm run build` → preview deploy (preview-scoped AUTH_* + second redirect URI — R11) for auth-flow smoke → `vercel --prod --yes` → gated health detail shows all AUTH vars live + migration block green.

### C. Live two-account protocol (A = owner, B = fresh Gmail)
1. Signed-out: `/` → `/login`; cookieless curl to every non-exempt API → 401/redirect, zero data.
2. Cron: no bearer → 401; secret unset (staging test) → 503; with bearer → 200, run attributed to OWNER_EMAIL.
3. Health: public response is booleans only — no email, no error detail; `?detail=1` without admin/CRON bearer → 403.
4. Owner parity: A lands onboarded; per-page row counts match pre-migration Airtable counts.
5. Onboarding E2E: B forced to `/onboarding`; deep links bounce back; single submit creates the row (`complete`) + zero UserTargets; `/targets` renders the live master count.
6. Isolation reads: B's pages show zero A rows everywhere; B's curl with A's record ids → empty/404, never A's fields.
7. Isolation writes: B's cookie + `POST /api/listings/<A-id>` and review routes with A's ids → 403/404; A's rows unchanged on fresh read.
8. Member CRUD: B creates a listing (match % computed vs B's prefs — and B with empty location prefs gets a location-neutral score, not Bay-Area-biased) and an application; both invisible to A.
9. Targets: B opts out (one action), adds a custom company (shows "pending verification"); persists across re-login; invisible to A outside view-as.
10. Profile: B edits name/voice; persists; A's profile unaffected. A edits voice → next draft run uses it (C2).
11. Member admin probes: B → `/admin` 403; `/api/admin/*` 403; forged `viewas` cookie ignored (B still sees only B); no audit row from B's attempts.
12. Admin view-as: A enters view-as B (confirm dialog) → banner, member nav, B's exact empty/sparse states; `Admin_Audit` enter row; mutation UI hidden and forced curl writes → 403 `read-only`; exit writes the exit row.
13. Disable lever: A disables B → B's next request (≤ ~60s) is signed out to a "account disabled" state; re-enable restores.
14. Kill-switch + cap: `AUTH_DISABLE_SIGNUP=1` blocks fresh account C, A+B unaffected; `USER_CAP=2` rejects C with the capacity copy; revert.
15. Regression: full §A suite green post-deploy; no Gmail send path; the only Gmail draft created during the protocol came from A's explicit draft approval; both crons complete next cycle with owner attribution.

---

## 14. Assumptions & open questions

### Assumptions
1. Vercel Hobby is adequate at `USER_CAP=10` (no per-member function/cron/LLM load in MVP); Phase 3 likely forces Pro.
2. Users are Airtable **rows**, not Airtable seats — members never get Airtable access; the Team upgrade is for record volume.
3. Google account email is the stable user key; email-change is handled by an admin re-key runbook (Auth Sub is the anchor), not code.
4. Cap raises and signup-mode changes are env-change + redeploy operations; no in-app toggles in MVP.
5. `/privacy` + `/terms` are good-faith templates, not attorney-reviewed (see Q12).
6. The consent screen passes without a sensitive-scope audit — member sign-in requests only `openid email profile`; `gmail.modify` stays on the owner's separate engine credential.
7. Abandoned (`pending`-onboarding) rows are purged manually from `/admin`; no reaper in MVP.
8. The H1B master is global and identical for all users; per-user deviations reference it, never fork it.
9. Member rows are scored with member prefs or neutral defaults — the owner's Bay-Area prefs are never inherited (standing rule for all future scoring work).

### Open questions (owner)
10. **Shared listings pool (blocking for Phase-2 planning):** should admin-scraped Job_Listings become a read-only browsable pool for members (deliberately bends strict isolation)? Scope, provenance labeling, and "claim into my pipeline" semantics need an explicit call.
11. **Approval-mode posture at M3:** `AUTH_REQUIRE_APPROVAL=1` for a soft first week, then open?
12. **GDPR/deletion posture:** manual admin deletion acceptable long-term, or does Phase 2 need self-serve delete? Affects `/privacy` wording now.
13. **Airtable Team payment** (M1 entry gate, C4): confirm the recurring cost; fallback = record-count diet, which delays M1.
14. **Second-admin path (Phase 4):** `ADMIN_EMAILS` env list (recommended) vs introducing a Role column then.
15. **H1B refresh ownership:** quarterly DOL LCA refresh + FY-label bump — owner-run, per a documented runbook. *(C3: owner is the placeholder owner until delegated.)*
16. **USER_CAP growth path:** what signal triggers a raise, and what ceiling forces the Phase-3 infra work?
17. `signup_toggle` audit action + in-app signup controls — reserved for Phase 2 if env levers prove too slow in an incident.

---

## 15. Critical files (create / modify)

**Create:** `app/src/lib/auth.ts` · `app/src/lib/session.ts` (incl. `getViewContext`, `assertWritable`) · `app/src/lib/prefs.ts` · `app/src/lib/targets.ts` (`effectiveTargets`) · `app/src/middleware.ts` · `app/src/app/api/auth/[...nextauth]/route.ts` · `app/src/app/login/` (+ `GoogleSignInButton`) · `app/src/app/onboarding/` (+ wizard) · `app/src/app/privacy/page.tsx`, `app/src/app/terms/page.tsx` · `app/src/app/(app)/layout.tsx` + `(app)/(admin)/layout.tsx` (route-group moves) · `app/src/app/(app)/profile/` · `app/src/app/(app)/(admin)/admin/` (+ `ViewAsButton`) · `app/src/components/layout/UserMenu.tsx`, `ViewAsBanner.tsx` · `app/src/components/targets/TargetCompanyEditor.tsx` · member CRUD forms + `app/src/app/api/{profile,targets/user,listings,applications,interviews,outreach,admin/users,admin/view-as,admin/migrate}/route.ts`

**Modify:** `app/src/lib/airtable.ts` (TABLES/FIELDS/FIELD_NAMES, `escapeFormulaString`, filterByFormula + owned-table throw, required `userEmail` signatures, `assertOwnership`/`withOwner`/`deleteRecords`, `*AllAdmin` variants) · `app/src/lib/fetcher.ts` (identity threading + prod mock rule) · `app/src/lib/workflows/filters.ts` (`OWNER_PREFS` extraction + prefs params) · `app/src/lib/workflows/draftEmails.ts` + `knowledge.ts` loader (owner Users-row prefs with constant fallback — C2) · engine writers (owner stamping) · `app/src/components/layout/Header.tsx`, `TopNav.tsx` · `app/src/app/api/cron/[job]/route.ts` (fail-closed) · `app/src/app/api/listings/[id]/route.ts`, `app/src/app/api/review/{lead,draft}/route.ts` (`assertOwnership` + `assertWritable` + admin gates) · `app/src/lib/health.ts` (split + multiuser block) · `app/src/lib/workflows/guardrails.test.ts` (G5–G13) · `app/package.json` (pinned `next-auth@5-beta`)

**Delete (M0):** `app/src/app/api/airtable/{listings,applications,outreach,targets,summary}/route.ts`, `app/src/app/api/gmail/threads/route.ts`, `app/src/app/api/apify/runs/route.ts`, `app/src/app/api/apollo/sequences/route.ts` (re-verify zero callers first; any live caller ⇒ admin-gate instead)
