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

import { normalizeEmail } from "./auth-shared";
import { primaryBase, usersTable, escapeFormulaString } from "./airtable";

const API = "https://api.airtable.com/v0";

// PRD §6.1 field names — frozen columns, never rename in Airtable.
const F = {
  email: "Email",
  name: "Name",
  authSub: "Auth Sub",
  accountStatus: "Account Status",
  onboardingStatus: "Onboarding Status",
  lastLogin: "Last Login",
} as const;

export interface UserRow {
  id: string;
  email: string;
  name?: string;
  accountStatus?: string; // "active" | "pending" | "disabled"
  onboardingStatus?: string; // "pending" | "complete"
  lastLogin?: string;
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
    lastLogin: r.fields[F.lastLogin] as string | undefined,
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
  cacheInit: { cache: "no-store" } | { next: { revalidate: number } },
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
    rows = await queryByEmail(email, { next: { revalidate: 30 } });
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
  onboardingStatus: "pending";
}): Promise<string> {
  if (!usersConfigured()) throw new Error("users table not configured");
  const fields: Record<string, unknown> = {
    [F.email]: normalizeEmail(input.email),
    [F.accountStatus]: input.accountStatus,
    [F.onboardingStatus]: input.onboardingStatus,
  };
  if (input.name) fields[F.name] = input.name;
  if (input.authSub) fields[F.authSub] = input.authSub;
  const res = await fetch(usersUrl(), {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    // typecast lets singleSelect option names pass as plain strings (house style).
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  if (!res.ok) throw new Error(`Airtable users POST ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { records: UsersRecord[] };
  return json.records[0].id;
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
