# IMPLEMENTATION — Multi-User Accounts, Profiles & Data Isolation (live progress tracker)

**Spec:** `PRD-multi-user.md` (locked 2026-06-10; panel-authored, PM-approved with C1–C4 folded in). Read the PRD first; this file is the resumable build state. After any meaningful change, update the phase tracker + change log here (house rule, same as `IMPLEMENTATION-workflow-engine.md`).

**Build state: NOT STARTED.** PRD locked; implementation awaits the owner's go-ahead + the M1 entry gate decision (Airtable Team payment, PRD §14 Q13).

## Status legend
`[ ]` not started · `[~]` in progress · `[x]` done · `[!]` blocked

## Phase tracker

### M0 — Hardening + auth shell (app goes private; data unchanged)
- [ ] 0.1 New GCP OAuth client for sign-in (`openid email profile`; prod + preview redirect URIs); consent screen → production (needs homepage + privacy URL — submit early, review gates signup not dev)
- [ ] 0.2 `/privacy` + `/terms` pages (template copy per PRD §7 voice rules)
- [ ] 0.3 Stage env: `AUTH_SECRET`, `AUTH_GOOGLE_ID/SECRET`, `OWNER_EMAIL`, `AUTH_DISABLE_SIGNUP=1`; confirm `CRON_SECRET`; re-scope Airtable PAT (2 bases, `data.records` only)
- [ ] 0.4 `next-auth@5-beta` (exact pin) + `lib/auth.ts` (signIn callback: email_verified strict, kill-switch, cap, approval mode, create-failure deny, duplicate fail-closed) + `lib/session.ts` (`requireUser*`, `requireAdmin*` = OWNER_EMAIL env, `getViewContext`, `assertWritable`) + `middleware.ts` (pinned matcher) + `/login`
- [ ] 0.5 **Delete** the 8 legacy open GET routes (`api/airtable/*` ×5, `api/gmail/threads`, `api/apify/runs`, `api/apollo/sequences`) — re-verify zero callers first
- [ ] 0.6 `CRON_SECRET` fail-closed (unset → 503, timing-safe) · CSRF (origin check + JSON content-type) · callbackUrl validation · health endpoint split (public booleans / gated detail)
- [ ] 0.7 Deploy 1 + verify: signed-out 401/redirect everywhere; owner-identical dashboard; cron semantics
- **Acceptance:** PRD §13C checks 1–3 pass; only OWNER_EMAIL can sign in.

### M1 — Schema (additive; owner-only audience) — `[!]` gated on Airtable Team payment (C4)
- [ ] 1.1 Airtable Team upgrade (primary base is at the Free 1,000-record cap today)
- [ ] 1.2 Create `Users`, `UserTargets`, `Admin_Audit` (exact single-select options per PRD §6 — pre-created, never typecast-minted); add `User Email` to jobListings/applications/interviews/outreach/workflowRuns (primary) + leads (leads base); capture all `tbl…`/`fld…` IDs
- **Acceptance:** schema visible; deployed M0 app unaffected.

### M2 — Isolation + backfill + product surfaces (ONE atomic deploy; signup still off)
- [ ] 2.1 `airtable.ts`: TABLES/FIELDS/FIELD_NAMES additions · `escapeFormulaString` (backslash-first; empty/control-char throw) · filterByFormula plumbing + owned-table runtime throw · required `userEmail` signatures (compiler-forced call-site migration) · `assertOwnership`/`withOwner`/`deleteRecords` · `*AllAdmin` variants
- [ ] 2.2 `lib/prefs.ts` (UserPrefs v1, `tejasDefaults`, `prefsOrNeutral`) + `filters.ts` `OWNER_PREFS` extraction (`matchScore`/`checkLocation` prefs param; engine call sites unchanged, existing tests pin the default path)
- [ ] 2.3 Engine: owner stamping on all writes; `drive.ts`/`execute.ts` OWNER_EMAIL fail-closed; knowledge loader prefers owner's Users-row voice/about with constant fallback (C2)
- [ ] 2.4 Route-group restructure (`(app)/`, `(app)/(admin)/`) + session-aware TopNav + async Header + `UserMenu`
- [ ] 2.5 `/onboarding` 3-step single-submit wizard (incl. outreach email — C1) + `PATCH /api/profile` (strict zod allowlist)
- [ ] 2.6 `/profile` 5 cards (incl. voice/about — C2) + `/targets` editor + `PUT /api/targets/user` (server-side diff to deviations) + `lib/targets.ts#effectiveTargets`
- [ ] 2.7 Member CRUD: create/edit forms + `POST /api/{listings,applications,interviews,outreach}` with compute-on-save match % (no hard delete)
- [ ] 2.8 `/admin` (user table, disable/enable) + view-as (signed cookie, enter/exit audit, `assertWritable` in every mutating route, ViewAsBanner, pixel-faithful member view)
- [ ] 2.9 Viz/empty states: S0 empty-card / S1 ratio suppression (<5 → "—") / member-hidden automation cards / per-page honest empty copy
- [ ] 2.10 `fetcher.ts` prod mock rule (never `source:"mock"` in production) + identity threading via `getViewContext`
- [ ] 2.11 Guardrail tests G5–G13 + unit suites (escaping vectors, signIn cases, prefsOrNeutral, tejasDefaults parity snapshot, effectiveTargets, view-as cookie) — write to fail-before/pass-after
- [ ] 2.12 Deploy 2 (atomic) → run chunked `POST /api/admin/migrate` backfill → verify via gated health detail (blank-owner counts 0, owner parity, formula-name probes)
- [ ] 2.13 Two-account protocol (hand-inserted test row): PRD §13C checks 4–15
- **Acceptance:** §13C green end-to-end; all pre-existing tests still pass.

### M3 — Open signup
- [ ] 3.1 Entry gates: §13C green · consent screen approved · /privacy + /terms live · owner call on `AUTH_REQUIRE_APPROVAL` soft-launch (PRD §14 Q11)
- [ ] 3.2 `AUTH_DISABLE_SIGNUP=0`, `USER_CAP=10` → redeploy; monitor signups (Last Login, /admin)
- **Acceptance:** PRD §12 success criteria 1–8 all verified live.

### P2 — Read-side personalization *(future)*
- [ ] Shared listings pool (BLOCKED on owner decision — PRD §14 Q10) · min-match-score/sources prefs · getting-started checklist · per-step onboarding save (if warranted) · admin audit viewer

### P3 — Multi-user automation *(future)*
- [ ] Entry gates: Vercel Pro · encrypted token-store design · quotas + cost model
- [ ] Per-user Gmail OAuth (draft-only per user) · per-user scraping from `effectiveTargets()` (custom-company ATS detection + admin H1B verification) · per-user drafting with user voice/about · per-user run attribution

### P4 — Full suite *(future)*
- [ ] Neon Postgres + RLS migration (trigger conditions: PRD §6.7) · `ADMIN_EMAILS` multi-admin · billing/tiers · full admin console · self-serve deletion · admin-surface audit review

## Key IDs & constants
- Bases: primary `app8aBP9UPmxYaEgI` · leads `appkusCXgR7KcEmLO`
- New table/field IDs: *(fill in at M1.2 — Users `tbl…`, UserTargets `tbl…`, Admin_Audit `tbl…`, per-table `User Email` `fld…`)*
- Frozen formula field names (`FIELD_NAMES`): `"User Email"` (6 tables), Users `"Email"` — **never rename in Airtable**
- Env (new): `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `OWNER_EMAIL`, `AUTH_DISABLE_SIGNUP`, `AUTH_REQUIRE_APPROVAL` (optional), `USER_CAP`; `CRON_SECRET` becomes mandatory
- Owned tables (userEmail required): jobListings, applications, interviews, outreach, leads, workflowRuns · Shared (no owner): h1bCompanies, scrapeTargets

## Decisions (from PRD §3)
D1 NextAuth v5 pinned, JWT ≤24h · D2 open signup + USER_CAP=10 + optional approval env · D3 admin = OWNER_EMAIL env, no Role column · D4 per-request Account Status check · D5 required userEmail + filter + post-filter + runtime throw · D6 backslash-first formula escaping + shape validation · D7 view-as signed cookie, read-only, enter/exit audit · D8 hybrid targets (mode flag + sparse deviations) · D9 3-step single-submit onboarding · D10 member CRUD + compute-on-save scoring + neutral defaults · D11 engine admin-only, owner-prefs knowledge loader · D12 M0 hardening baseline · D13 health split · D14 5-action audit · D15 gated rollout

## Guardrails (must hold in code — tests G1–G13)
Never send · human gate (review/draft sole Gmail writer, admin-only) · H1B source-scope (custom companies automation-excluded until verified) · idempotent+monotonic · every owned read tenant-scoped · no unauthenticated route · no mutation without ownership proof · pinned middleware matcher · no mock in prod · view-as structurally read-only · engine identity fail-closed · admin surface gated · no formula injection

## Next action
**Owner go-ahead.** Then: confirm Airtable Team payment (M1 gate, PRD §14 Q13) and answer §14 Q11 (approval-mode soft launch). Build order is strict: M0 (0.1–0.7) before any schema work — the M0 verify step is the acceptance gate for starting M1.

## Change log
- **2026-06-10 (1)** — **PRD authored and locked.** 7-role agent panel (PM, TPM, backend, frontend, data engineer, viz, brand) drafted in parallel; Stage-2 reviews: security red-team (CR-S1–25 — found 2 live breaches in current code: 8 unauthenticated full-table-dump GET routes, and formula-injection exposure in the proposed ownership checks; both resolved in the design), PM scope (CR-P1–12), engineering consistency (CR-E1–12 + unified rollout). TPM tie-breaks T1–T8 (open signup with optional approval env; single-submit onboarding; no Role column; empty-state card over checklist; trimmed onboarding fields; USER_CAP=10; split health endpoint; 5-action audit). PM sign-off APPROVED-WITH-CHANGES; C1 (outreach email in onboarding), C2 (editable voice/about + engine reads owner's stored prefs), C3 (custom-company verification semantics), C4 (Airtable Team = M1 entry gate) folded into the final text. **No code or schema changed.**
