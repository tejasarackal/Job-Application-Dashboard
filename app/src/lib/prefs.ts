// prefs.ts — UserPrefs v1: the per-user preferences JSON stored in the Users
// table "Preferences" long-text column (PRD-multi-user §6.2, D9/D10).
//
// Defensive-parse discipline: anything read from Airtable is hostile until it
// passes the zod schema (unknown keys stripped). Any failure degrades to
// `neutralDefaults()` — NEVER to `tejasDefaults()` for a non-owner: the
// owner's bio/voice leaking into another user's context is its own breach
// class. The single owner-only exception lives in `getUserPrefs`.
//
// Note: `@/lib/users` is loaded lazily inside `getUserPrefs` (type-only import
// here) so this module — and the pure consumers that import it (filters tests,
// targets) — never pull the Airtable client at module-init time.

import { z } from "zod";
import { OWNER_PREFS } from "@/lib/workflows/filters";
import { ABOUT, VOICE } from "@/lib/workflows/knowledge";
import { isOwner } from "@/lib/auth-shared";
import type { UserRow } from "@/lib/users";

// ── Schema (versioned, zod-validated, unknown keys stripped) ─────────────────

export interface UserPrefs {
  v: 1;
  identity: { outreachEmail?: string };
  jobPrefs: {
    /** Plain substrings; consumers regex-escape before alternation — user
     *  input never compiles into a raw regex (filters.ts#escapeRegExp). */
    titleKeywords: string[];
    /** Empty = neutral "anywhere" (location-neutral scoring, no metro lists). */
    locations: string[];
    remotePref: "remote_only" | "onsite_ok" | "no_preference";
  };
  /** Outreach voice rules — editable on /profile (C2). */
  voice?: string;
  /** Bio block — editable on /profile (C2). */
  about?: string;
}

// z.object strips unknown keys by default — Phase-2 additions (minMatchScore,
// sources, seniority pref) parse cleanly on old code, and junk never persists
// into consumers.
const userPrefsSchema = z.object({
  v: z.literal(1),
  identity: z.object({ outreachEmail: z.string().optional() }),
  jobPrefs: z.object({
    titleKeywords: z.array(z.string()),
    locations: z.array(z.string()),
    remotePref: z.enum(["remote_only", "onsite_ok", "no_preference"]),
  }),
  voice: z.string().optional(),
  about: z.string().optional(),
});

// ── Write guard (Airtable long-text headroom — PRD §6.1: size-guarded <90k) ──

export const PREFS_MAX_CHARS = 90_000;

/** Serialize for the Users."Preferences" write; throws when over the cap so a
 *  pathological voice/about paste can never wedge the row. */
export function serializePrefs(p: UserPrefs): string {
  const json = JSON.stringify(p);
  if (json.length > PREFS_MAX_CHARS) {
    throw new Error(`prefs: serialized preferences exceed ${PREFS_MAX_CHARS} chars (got ${json.length})`);
  }
  return json;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

/** Member fallback: empty keywords/locations (neutral scoring), no preference,
 *  NO voice/about. The safe default for any new or unparseable row. */
export function neutralDefaults(): UserPrefs {
  return {
    v: 1,
    identity: {},
    jobPrefs: { titleKeywords: [], locations: [], remotePref: "no_preference" },
  };
}

/** The owner's seed (PRD §6.2): voice/about verbatim from knowledge.ts;
 *  titleKeywords/locations mirror filters.ts#OWNER_PREFS (a test pins the
 *  parity); remotePref "onsite_ok" = current scoring behavior. Used by the
 *  migration backfill and the owner-only fallback in getUserPrefs. */
export function tejasDefaults(): UserPrefs {
  return {
    v: 1,
    identity: { outreachEmail: process.env.OWNER_EMAIL ?? "tejasarackal90@gmail.com" },
    jobPrefs: {
      titleKeywords: [...OWNER_PREFS.titleKeywords],
      locations: [...OWNER_PREFS.locations],
      remotePref: "onsite_ok",
    },
    voice: VOICE,
    about: ABOUT,
  };
}

// ── Defensive parse ──────────────────────────────────────────────────────────

function warnInvalid(stage: "json" | "schema" | "lookup", detail: unknown): void {
  console.warn(
    JSON.stringify({
      event: "user_prefs_invalid",
      stage,
      detail: String(detail).slice(0, 300),
    }),
  );
}

/** Strict parse to UserPrefs, or null. Warns (structured) on any failure. */
function tryParsePrefs(json: string): UserPrefs | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    warnInvalid("json", e);
    return null;
  }
  const parsed = userPrefsSchema.safeParse(raw);
  if (!parsed.success) {
    warnInvalid("schema", parsed.error.message);
    return null;
  }
  return parsed.data;
}

/** JSON.parse + zod safeParse; ANY failure → structured warning +
 *  `neutralDefaults()`. Never returns tejasDefaults for arbitrary input. */
export function prefsOrNeutral(preferencesJson: string | null | undefined): UserPrefs {
  if (preferencesJson == null || preferencesJson.trim() === "") return neutralDefaults();
  return tryParsePrefs(preferencesJson) ?? neutralDefaults();
}

// ── Lookup ───────────────────────────────────────────────────────────────────

// UserRow grows a `preferences` field in M2 (Agent A); intersect so this
// module compiles against both the M0 and M2 shapes.
type UserRowWithPrefs = UserRow & { preferences?: string | null };

/** Users-row prefs for `email` (30s-cached lookup). Members degrade to
 *  `neutralDefaults()` on any miss/parse failure; the OWNER (normalized
 *  compare vs OWNER_EMAIL) degrades to `tejasDefaults()` instead — owner-only
 *  exception per PRD §6.2, so the engine never loses his seed. */
export async function getUserPrefs(email: string): Promise<UserPrefs> {
  let raw: string | null | undefined;
  try {
    const { getUserRowCached } = await import("@/lib/users");
    const row = (await getUserRowCached(email)) as UserRowWithPrefs | null;
    raw = row?.preferences;
  } catch (e) {
    // Includes the duplicate-row security throw — for prefs purposes that is
    // "no usable row"; auth handles the deny separately.
    warnInvalid("lookup", e);
    raw = undefined;
  }
  if (isOwner(email)) {
    if (raw == null || raw.trim() === "") return tejasDefaults();
    return tryParsePrefs(raw) ?? tejasDefaults();
  }
  return prefsOrNeutral(raw);
}
