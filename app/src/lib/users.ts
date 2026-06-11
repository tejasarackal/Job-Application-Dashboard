// Users-table data access for auth. Node runtime only — called from the signIn
// callback (via the auth route handler) and session.ts, never from middleware.
//
// M1 created the Users table (`TABLES.users` in airtable.ts), so this module is
// live whenever the Airtable token is present. The `AIRTABLE_USERS_TABLE` env
// override (already staged in Vercel) still wins via `usersTable()`.
//
// Deliberate exception to the field-ID house rule: this table is addressed by
// field NAME. The names below are the PRD §6.1 names and are FROZEN in Airtable
// (same rule that pins the formula names — a rename fails closed to "no rows").

import { revalidateTag } from "next/cache";
import { normalizeEmail } from "./auth-shared";
import { primaryBase, usersTable, escapeFormulaString, updateRecords, FIELDS } from "./airtable";
import { encryptSecret, decryptSecret } from "./crypto";

const API = "https://api.airtable.com/v0";

/** Per-user cache tag for the 30s-cached Users-row read. Any write to a user's
 *  row revalidates this tag so the next read is fresh — fixes the onboarding
 *  race where the gate saw a stale "pending" row right after completion. */
export const userTag = (email: string) => `user:${normalizeEmail(email)}`;

/** Bust the cached Users row for one email. Best-effort: a revalidate failure
 *  (e.g. called outside a request scope) must never fail the underlying write. */
function bustUserCache(email: string): void {
  try {
    revalidateTag(userTag(email));
  } catch (e) {
    console.error("users: revalidateTag failed (non-fatal)", e);
  }
}

// PRD §6.1 field names — frozen columns, never rename in Airtable.
const F = {
  email: "Email",
  name: "Name",
  authSub: "Auth Sub",
  accountStatus: "Account Status",
  onboardingStatus: "Onboarding Status",
  defaultTargets: "Default Targets",
  preferences: "Preferences",
  lastLogin: "Last Login",
  gmailToken: "Gmail Refresh Token", // AES-GCM ciphertext (Phase 3b)
  gmailEmail: "Gmail Email",
  gmailConnectedAt: "Gmail Connected At",
} as const;

export interface UserRow {
  id: string;
  email: string;
  name?: string | null;
  accountStatus?: string; // "active" | "pending" | "disabled"
  onboardingStatus?: string; // "pending" | "complete"
  defaultTargets?: string | null; // "h1b_all" | "none"
  preferences?: string | null; // UserPrefs v1 JSON (lib/prefs.ts parses it)
  lastLogin?: string;
  gmailEmail?: string | null; // connected Gmail address (Phase 3b) — display
  gmailConnectedAt?: string | null;
  // NB: the encrypted refresh token is deliberately NOT on UserRow — it never
  // travels with the cached row. Read it only via getGmailRefreshToken().
}

/** True when Airtable is reachable. The Users table id is hardcoded since M1
 *  (`TABLES.users`), so only the token gates configuration; the staged
 *  `AIRTABLE_USERS_TABLE` env override is honored inside `usersTable()`.
 *  Lazy env read — never throws, safe with zero env at build time. */
export function usersConfigured(): boolean {
  return Boolean(process.env.AIRTABLE_TOKEN);
}

// Formula safety (PRD D6): `escapeFormulaString` was hoisted into airtable.ts
// in M2 (single owner for the injection defense) — imported above.

// RFC-lite shape check before any email is interpolated into a formula.
const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function ownerFormula(email: string): string {
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) throw new Error("invalid email shape");
  return `LOWER({${F.email}})='${escapeFormulaString(normalized)}'`;
}

// ── Raw fetch helpers (lazy env, field names as keys) ────────────────────────

interface UsersRecord {
  id: string;
  fields: Record<string, unknown>;
}

function selectName(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "name" in v) return (v as { name: string }).name;
  return undefined;
}

function toRow(r: UsersRecord): UserRow {
  return {
    id: r.id,
    email: normalizeEmail(String(r.fields[F.email] ?? "")),
    name: r.fields[F.name] as string | undefined,
    accountStatus: selectName(r.fields[F.accountStatus]),
    onboardingStatus: selectName(r.fields[F.onboardingStatus]),
    defaultTargets: selectName(r.fields[F.defaultTargets]),
    preferences: r.fields[F.preferences] as string | undefined,
    lastLogin: r.fields[F.lastLogin] as string | undefined,
    gmailEmail: (r.fields[F.gmailEmail] as string | undefined) ?? null,
    gmailConnectedAt: (r.fields[F.gmailConnectedAt] as string | undefined) ?? null,
  };
}

function usersUrl(): string {
  return `${API}/${primaryBase()}/${usersTable()}`;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}` };
}

async function queryByEmail(
  email: string,
  cacheInit: { cache: "no-store" } | { next: { revalidate: number; tags?: string[] } },
): Promise<UserRow[]> {
  const url = new URL(usersUrl());
  url.searchParams.set("filterByFormula", ownerFormula(email));
  url.searchParams.set("pageSize", "10");
  const res = await fetch(url.toString(), { headers: authHeaders(), ...cacheInit });
  if (!res.ok) throw new Error(`Airtable users ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { records: UsersRecord[] };
  return json.records.map(toRow);
}

// ── Public surface ───────────────────────────────────────────────────────────

/** Fresh (no-store) Users-row lookup by normalized email.
 *  - Unconfigured table → null, never throws (M0 reality).
 *  - Lookup error → null (fail closed: treated as "no row" — a new signup then
 *    hits the create path, which itself fails closed; the owner never depends
 *    on this lookup because signIn admits the owner before calling it).
 *  - >1 row for one email → THROWS (security anomaly, PRD §5.1) — the signIn
 *    callback's catch-all turns that into a deny. */
export async function getUserRow(email: string): Promise<UserRow | null> {
  if (!usersConfigured()) return null;
  let rows: UserRow[];
  try {
    rows = await queryByEmail(email, { cache: "no-store" });
  } catch (e) {
    console.error("users: lookup failed (treated as no row)", e);
    return null;
  }
  if (rows.length > 1) throw new Error("users: duplicate rows for one email — failing closed");
  return rows[0] ?? null;
}

/** 30s-cached variant for the per-request Account Status check (PRD D4) —
 *  disable propagates in ≤ ~60s without hitting Airtable on every request.
 *  Same error contract as getUserRow. */
export async function getUserRowCached(email: string): Promise<UserRow | null> {
  if (!usersConfigured()) return null;
  let rows: UserRow[];
  try {
    rows = await queryByEmail(email, { next: { revalidate: 30, tags: [userTag(email)] } });
  } catch (e) {
    console.error("users: cached lookup failed (treated as no row)", e);
    return null;
  }
  if (rows.length > 1) throw new Error("users: duplicate rows for one email — failing closed");
  return rows[0] ?? null;
}

/** Total registered users, for the USER_CAP check. Throws when unconfigured
 *  or on API failure — the signIn callback treats a throw as deny. */
export async function countUsers(): Promise<number> {
  if (!usersConfigured()) throw new Error("users table not configured");
  let count = 0;
  let offset: string | undefined;
  for (let i = 0; i < 10; i++) {
    const url = new URL(usersUrl());
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("fields[]", F.email);
    if (offset) url.searchParams.set("offset", offset);
    const res = await fetch(url.toString(), { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error(`Airtable users ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { records: UsersRecord[]; offset?: string };
    count += json.records.length;
    offset = json.offset;
    if (!offset) break;
  }
  return count;
}

/** Create the Users row at first sign-in. Throws on any failure — the signIn
 *  callback treats a throw as deny (a session must never exist without a row). */
export async function createUserRow(input: {
  email: string;
  name?: string;
  authSub?: string;
  accountStatus: "active" | "pending";
  onboardingStatus: "pending" | "complete";
  defaultTargets?: "h1b_all" | "none";
  preferences?: string;
}): Promise<string> {
  if (!usersConfigured()) throw new Error("users table not configured");
  const fields: Record<string, unknown> = {
    [F.email]: normalizeEmail(input.email),
    [F.accountStatus]: input.accountStatus,
    [F.onboardingStatus]: input.onboardingStatus,
  };
  if (input.name) fields[F.name] = input.name;
  if (input.authSub) fields[F.authSub] = input.authSub;
  if (input.defaultTargets) fields[F.defaultTargets] = input.defaultTargets;
  if (input.preferences) fields[F.preferences] = input.preferences;
  const res = await fetch(usersUrl(), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    // typecast lets singleSelect option names pass as plain strings (house style).
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  if (!res.ok) throw new Error(`Airtable users POST ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { records: UsersRecord[] };
  bustUserCache(input.email); // clear any cached "no row" so the new row reads immediately
  return json.records[0].id;
}

// Typed self-service patch (PRD §5.3 /api/profile + §7.4/§7.5). Email is
// deliberately absent — the PK is never rewritten through this path.
export interface UserRowPatch {
  name?: string;
  authSub?: string;
  accountStatus?: "active" | "pending" | "disabled";
  onboardingStatus?: "pending" | "complete";
  defaultTargets?: "h1b_all" | "none";
  preferences?: string; // serialized UserPrefs v1 (lib/prefs.ts#serializePrefs)
}

/** PATCH the user's own Users row. Fresh row lookup by normalized email, then
 *  a field-ID write via the shared airtable.ts write layer (typecast handles
 *  single-select option names). Never writes Email. Throws when the table is
 *  unconfigured or no row exists — callers decide whether to create instead. */
export async function updateUserRow(email: string, patch: UserRowPatch): Promise<void> {
  if (!usersConfigured()) throw new Error("users table not configured");
  const row = await getUserRow(email);
  if (!row) throw new Error("users: no row to update");
  const f = FIELDS.users;
  const fields: Record<string, unknown> = {};
  if (patch.name !== undefined) fields[f.name] = patch.name;
  if (patch.authSub !== undefined) fields[f.authSub] = patch.authSub;
  if (patch.accountStatus !== undefined) fields[f.accountStatus] = patch.accountStatus;
  if (patch.onboardingStatus !== undefined) fields[f.onboardingStatus] = patch.onboardingStatus;
  if (patch.defaultTargets !== undefined) fields[f.defaultTargets] = patch.defaultTargets;
  if (patch.preferences !== undefined) fields[f.preferences] = patch.preferences;
  if (Object.keys(fields).length === 0) return;
  await updateRecords(usersTable(), primaryBase(), [{ id: row.id, fields }]);
  bustUserCache(email); // fresh read next request — fixes the onboarding stale-gate race
}

// ── Per-user Gmail connection (Phase 3b) ──────────────────────────────────────

/** Store a user's Gmail connection. The refresh token is AES-GCM encrypted at
 *  rest — plaintext never touches Airtable, logs, or any client response. */
export async function setGmailConnection(
  email: string,
  conn: { refreshToken: string; gmailEmail: string },
): Promise<void> {
  if (!usersConfigured()) throw new Error("users table not configured");
  const row = await getUserRow(email);
  if (!row) throw new Error("users: no row to attach Gmail to");
  const f = FIELDS.users;
  await updateRecords(usersTable(), primaryBase(), [
    {
      id: row.id,
      fields: {
        [f.gmailRefreshToken]: encryptSecret(conn.refreshToken),
        [f.gmailEmail]: conn.gmailEmail,
        [f.gmailConnectedAt]: new Date().toISOString().slice(0, 10),
      },
    },
  ]);
  bustUserCache(email);
}

/** Disconnect Gmail: clear the stored token + metadata. */
export async function clearGmailConnection(email: string): Promise<void> {
  if (!usersConfigured()) throw new Error("users table not configured");
  const row = await getUserRow(email);
  if (!row) return;
  const f = FIELDS.users;
  await updateRecords(usersTable(), primaryBase(), [
    { id: row.id, fields: { [f.gmailRefreshToken]: "", [f.gmailEmail]: "", [f.gmailConnectedAt]: null } },
  ]);
  bustUserCache(email);
}

/** Decrypted Gmail refresh token for `email`, or null if not connected / on any
 *  decrypt failure. Fresh read — the ciphertext is never on the cached UserRow.
 *  SERVER-ONLY: never return this value to a client. */
export async function getGmailRefreshToken(email: string): Promise<string | null> {
  if (!usersConfigured()) return null;
  try {
    const url = new URL(usersUrl());
    url.searchParams.set("filterByFormula", ownerFormula(email));
    url.searchParams.set("pageSize", "2");
    const res = await fetch(url.toString(), { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { records: UsersRecord[] };
    if (json.records.length !== 1) return null;
    const enc = json.records[0].fields[F.gmailToken] as string | undefined;
    if (!enc || !enc.trim()) return null;
    return decryptSecret(enc);
  } catch (e) {
    console.error("users: gmail token read/decrypt failed", e);
    return null;
  }
}

/** Best-effort Last-Login touch, throttled to once per UTC day. Errors are
 *  swallowed — a write failure must never block an existing user's sign-in.
 *  Call without awaiting (fire-and-forget). */
export async function touchLastLogin(row: UserRow): Promise<void> {
  try {
    if (!usersConfigured()) return;
    const today = new Date().toISOString().slice(0, 10);
    if (row.lastLogin && row.lastLogin.slice(0, 10) === today) return;
    const res = await fetch(usersUrl(), {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        records: [{ id: row.id, fields: { [F.lastLogin]: new Date().toISOString() } }],
        typecast: true,
      }),
    });
    if (!res.ok) throw new Error(`Airtable users PATCH ${res.status}`);
  } catch (e) {
    console.error("users: last-login touch failed (ignored)", e);
  }
}
