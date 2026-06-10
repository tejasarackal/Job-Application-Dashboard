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
// (N separate runs would blow the poll deadline).
export function linkedinKeywordQuery(): string {
  return DE_KEYWORDS.map((k) => (k.includes(" ") ? `"${k}"` : k)).join(" OR ");
}
