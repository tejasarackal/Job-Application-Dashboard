// health.ts — credential health checks. Each makes ONE cheap authenticated call
// so the operator can confirm every integration's key works before running
// workflows. Used by /api/health/credentials. All checks run in parallel with a
// per-call timeout so the whole thing stays well inside Vercel's function limit.
export interface CredCheck {
  service: string;
  configured: boolean; // required env var(s) present
  ok: boolean; // live call succeeded
  detail: string;
}

const TIMEOUT_MS = 8000;

async function ping(
  service: string,
  envVars: string[],
  call: (signal: AbortSignal) => Promise<{ ok: boolean; detail: string }>,
): Promise<CredCheck> {
  const missing = envVars.filter((v) => !process.env[v]);
  if (missing.length) {
    return { service, configured: false, ok: false, detail: `missing ${missing.join(", ")}` };
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await call(ctrl.signal);
    return { service, configured: true, ok: r.ok, detail: r.detail };
  } catch (e) {
    return { service, configured: true, ok: false, detail: (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

async function checkAirtable(signal: AbortSignal) {
  const base = process.env.AIRTABLE_BASE_ID || "app8aBP9UPmxYaEgI";
  const res = await fetch(
    `https://api.airtable.com/v0/${base}/tblGVG4F5cTrAoaoh?maxRecords=1`,
    { headers: { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` }, signal },
  );
  return { ok: res.ok, detail: res.ok ? "auth ok" : `HTTP ${res.status}` };
}

async function checkApollo(signal: AbortSignal) {
  const res = await fetch("https://api.apollo.io/api/v1/auth/health", {
    headers: { "X-Api-Key": process.env.APOLLO_API_KEY!, "Content-Type": "application/json" },
    signal,
  });
  return { ok: res.ok, detail: res.ok ? "auth ok" : `HTTP ${res.status}` };
}

async function checkApify(signal: AbortSignal) {
  const res = await fetch(`https://api.apify.com/v2/users/me?token=${process.env.APIFY_TOKEN}`, {
    signal,
  });
  return { ok: res.ok, detail: res.ok ? "auth ok" : `HTTP ${res.status}` };
}

async function checkAnthropic(signal: AbortSignal) {
  // Minimal 1-token completion — verifies the key end-to-end for ~nothing.
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
    signal,
  });
  return { ok: res.ok, detail: res.ok ? "auth ok" : `HTTP ${res.status}` };
}

async function checkGmail(signal: AbortSignal) {
  // refresh_token → access_token → profile. Proves the whole server-side chain.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
    signal,
  });
  if (!tokenRes.ok) return { ok: false, detail: `token refresh HTTP ${tokenRes.status}` };
  const tok = (await tokenRes.json()) as { access_token?: string };
  if (!tok.access_token) return { ok: false, detail: "no access_token returned" };
  const profile = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${tok.access_token}` },
    signal,
  });
  if (!profile.ok) return { ok: false, detail: `profile HTTP ${profile.status}` };
  const p = (await profile.json()) as { emailAddress?: string };
  return { ok: true, detail: p.emailAddress ?? "ok" };
}

// ── Response shaping (PRD D13 — public/detail split) ─────────────────────────
//
// Public: booleans ONLY. No email addresses, no upstream error strings, no env
// names beyond the five fixed keys. Anything sensitive lives exclusively in the
// detail shape, which the route gates behind admin session OR Bearer CRON_SECRET.

export interface PublicHealth {
  ok: boolean;
  checks: {
    airtable: boolean;
    gmail: boolean;
    anthropic: boolean;
    apify: boolean;
    auth: boolean;
  };
}

// `auth` = all five auth-stack env vars present (lazy read — never at module load).
const AUTH_ENV_KEYS = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "OWNER_EMAIL",
  "CRON_SECRET",
] as const;

function authEnvPresent(): boolean {
  return AUTH_ENV_KEYS.every((k) => Boolean(process.env[k]));
}

/** Public shaper — booleans only. MUST never touch CredCheck beyond `.service`/`.ok`. */
export function shapePublicHealth(results: CredCheck[]): PublicHealth {
  const okFor = (service: string) => results.some((c) => c.service === service && c.ok);
  const checks = {
    airtable: okFor("Airtable"),
    gmail: okFor("Gmail"),
    anthropic: okFor("Anthropic"),
    apify: okFor("Apify"),
    auth: authEnvPresent(),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}

export interface DetailHealth {
  ok: boolean;
  checks: CredCheck[];
}

/** Detail shaper — full per-service ok/detail/error payload. Gated by the route. */
export function shapeDetailHealth(results: CredCheck[]): DetailHealth {
  // M2: multiuser block (blank-owner counts, formula-name probes) lands here
  return { ok: results.every((c) => c.ok), checks: results };
}

export async function checkCredentials(): Promise<CredCheck[]> {
  return Promise.all([
    ping("Airtable", ["AIRTABLE_TOKEN"], checkAirtable),
    ping("Apollo", ["APOLLO_API_KEY"], checkApollo),
    ping("Apify", ["APIFY_TOKEN"], checkApify),
    ping("Anthropic", ["ANTHROPIC_API_KEY"], checkAnthropic),
    ping(
      "Gmail",
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"],
      checkGmail,
    ),
    // NinjaPear has no public REST ping wired here; presence-check only. It is
    // live-verified on the first research run (Phase 2) via its company endpoint.
    Promise.resolve<CredCheck>({
      service: "NinjaPear",
      configured: Boolean(process.env.NINJAPEAR_API_KEY),
      ok: Boolean(process.env.NINJAPEAR_API_KEY),
      detail: process.env.NINJAPEAR_API_KEY
        ? "key present (live-verified on first research call)"
        : "missing NINJAPEAR_API_KEY",
    }),
  ]);
}
