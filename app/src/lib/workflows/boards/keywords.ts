// Shared DE search-keyword set, used to widen recall at the SOURCE for the two
// keyword-driven scrapers — the Workday CXS adapter (one search per keyword) and
// the LinkedIn f_C fallback (one OR-joined query). A single "Data Engineer" search
// buried adjacent roles (Analytics Engineer, Data Platform, …) past the result cap;
// these phrases surface them. Every entry MUST satisfy filters.ts#DE_TITLE_RE so a
// keyword can never pull in a title the downstream gate would reject (asserted in
// filters.test.ts). Keep this in sync with DE_TITLE_RE.
export const DE_KEYWORDS = [
  "data engineer",
  "analytics engineer",
  "data platform",
  "data infrastructure",
  "etl",
  "data warehouse",
  "data architect",
] as const;

// LinkedIn `keywords=` accepts a boolean OR expression. Multi-word phrases are
// quoted so they match as a phrase, not loose tokens. One query = one Apify run
// (N separate runs would blow the poll deadline). Defaults to DE_KEYWORDS; the
// scrape passes the ACTOR's keywords for a member (Phase 4).
export function linkedinKeywordQuery(keywords: readonly string[] = DE_KEYWORDS): string {
  const list = keywords.length ? keywords : DE_KEYWORDS;
  return list.map((k) => (k.includes(" ") ? `"${k}"` : k)).join(" OR ");
}

// ── Per-user source search derivation (multi-user Phase 4) ───────────────────
// The two keyword-driven scrapers (Workday CXS, LinkedIn) must search for the
// ACTOR's roles, not the owner's DE set. The owner keeps DE_KEYWORDS byte-for-
// byte (ownerTitleTiers); a member searches their own titleKeywords; an empty
// member set falls back to DE_KEYWORDS (defensive — onboarding requires ≥1).
import type { ScoringPrefs } from "../filters";

export function searchKeywordsFor(prefs: ScoringPrefs): string[] {
  if (prefs.ownerTitleTiers) return [...DE_KEYWORDS];
  return prefs.titleKeywords.length ? [...prefs.titleKeywords] : [...DE_KEYWORDS];
}

// LinkedIn `location=` for the actor: owner → the legacy Bay-Area string; a
// member → their first listed location; neutral (no locations) → United States
// (broad, since the post-filter location gate is itself neutral-pass).
export function linkedinLocationFor(prefs: ScoringPrefs): string {
  if (prefs.ownerTitleTiers) return "San Francisco Bay Area";
  return prefs.locations[0]?.trim() || "United States";
}
