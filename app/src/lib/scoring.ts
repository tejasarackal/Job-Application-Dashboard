// scoring.ts — UserPrefs → ScoringPrefs converter (PRD-multi-user D10, §7.7).
//
// Member semantics (Wave-1 Agent B notes): titleKeywords and locations come
// from the member's own UserPrefs; `disqualifiedMetros` is ALWAYS empty — the
// owner's Bay-Area metro blocklist must never leak into a member's scoring.
// remotePref passes through. The OWNER scores via OWNER_PREFS directly so his
// rows keep the legacy tiered DE-title path (ownerTitleTiers), byte-for-byte
// with the engine's scrape-time scoring.
//
// New file by design: filters.ts (pure engine module) and prefs.ts (Airtable
// lookup) stay untouched; this is the only bridge between the two shapes.

import type { UserPrefs } from "@/lib/prefs";
import { OWNER_PREFS, type ScoringPrefs } from "@/lib/workflows/filters";
import { isOwner } from "@/lib/auth-shared";

/** Member conversion: prefs-derived keywords/locations, no metro blocklist,
 *  no owner title tiers. Arrays are copied so callers can't mutate prefs. */
export function toScoringPrefs(prefs: UserPrefs): ScoringPrefs {
  return {
    titleKeywords: [...prefs.jobPrefs.titleKeywords],
    locations: [...prefs.jobPrefs.locations],
    // Owner metros must never leak — a neutral/member user has no blocklist.
    disqualifiedMetros: [],
    remotePref: prefs.jobPrefs.remotePref,
  };
}

/** Identity-aware resolution: the owner gets OWNER_PREFS (tiered title path);
 *  everyone else gets prefs converted with member semantics. */
export function scoringPrefsFor(email: string, prefs: UserPrefs): ScoringPrefs {
  return isOwner(email) ? OWNER_PREFS : toScoringPrefs(prefs);
}

/** Compute-on-save gate (D10): with no title keywords and no owner tier path
 *  there is no title-match basis — omit the match field (renders "—") rather
 *  than persisting a misleading keyword-less number. */
export function canComputeMatch(prefs: ScoringPrefs): boolean {
  return Boolean(prefs.ownerTitleTiers) || prefs.titleKeywords.length > 0;
}
