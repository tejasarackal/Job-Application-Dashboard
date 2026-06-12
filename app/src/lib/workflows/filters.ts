// filters.ts — deterministic gates ported from the automate-job-search SOPs.
// No credentials, no I/O — pure functions, so they're cheap to unit-test and
// safe to call anywhere. Source of truth for the rules:
//   _job_scraping_instruction.md (H1B + DE-title + dedup),
//   _location_preferences.md (location).
import { lookupCompany } from "@/lib/company-registry";

// ── H1B sponsor allowlist ─────────────────────────────────────────────────────
// Proactive targeting (scraping/research) is gated to known sponsors. Reactive
// tracking (Gmail sync) uses pipeline-scope instead — see syncApplications.
export function isH1bSponsor(company: string | undefined): boolean {
  return Boolean(company && lookupCompany(company));
}

// ── DE-title gate ─────────────────────────────────────────────────────────────
// DE-adjacent family (not just "data engineer"): the Apify/Workday sources do a
// keyword search, so legit adjacent titles (database/warehouse/pipeline/ETL/
// data-architect/dataops + data-anchored SWE) were being dropped alongside noise.
// Deliberately excludes ML Engineer / Data Scientist / Data Analyst (out of scope).
export const DE_TITLE_RE =
  /data engineer|analytics engineer|data platform|data infra(structure)?|data pipeline|data warehous(e|ing)|database engineer|big ?data engineer|\betl\b|data architect|data ?ops|(software|backend) engineer[\s,\-–—()]+.*\bdata\b/i;
// Internships/co-ops/new-grad rotations are out of scope (an "Internship, Data
// Engineer" leaked through before — _job_scraping_instruction.md is FTE-only).
const INTERN_RE = /\b(intern(ship)?|co-?op|apprentice(ship)?|new ?grad|graduate program|working student)\b/i;
export function isDeTitle(title: string | undefined): boolean {
  return Boolean(title && DE_TITLE_RE.test(title) && !INTERN_RE.test(title));
}

// Per-user title gate (multi-user Phase 4): which scraped titles a given user
// keeps. Interns/co-ops are excluded for EVERYONE (FTE-only is a system rule,
// not a preference). The OWNER keeps the curated DE regex byte-for-byte
// (ownerTitleTiers); a member keeps titles matching ANY of their own
// titleKeywords. Empty member keywords → matches nothing (no basis to filter;
// pairs with canComputeMatch rendering "—").
export function titleMatches(title: string | undefined, prefs: ScoringPrefs): boolean {
  if (!title || INTERN_RE.test(title)) return false;
  if (prefs.ownerTitleTiers) return DE_TITLE_RE.test(title);
  const re = keywordsRe(prefs.titleKeywords);
  return re ? re.test(title) : false;
}

// ── Location gate (vendored from _location_preferences.md) ────────────────────
// Exported as the owner's Bay-Area city list — `lib/prefs.ts#tejasDefaults`
// seeds the owner's UserPrefs.locations from it (PRD-multi-user §6.2).
export const BAY_AREA_CITIES = [
  // South Bay / Silicon Valley
  "san jose", "santa clara", "sunnyvale", "mountain view", "cupertino", "los altos",
  "los gatos", "campbell", "saratoga", "milpitas", "fremont", "newark", "union city", "hayward",
  // Peninsula
  "palo alto", "menlo park", "east palo alto", "redwood city", "redwood shores", "san carlos",
  "belmont", "foster city", "san mateo", "burlingame", "millbrae", "san bruno", "south san francisco",
  // SF + East Bay
  "san francisco", "oakland", "emeryville", "berkeley", "alameda", "san leandro", "pleasanton",
  "dublin", "san ramon", "livermore", "walnut creek", "concord",
  // Generic catch-alls
  "bay area", "greater bay area", "silicon valley",
];
const DISQUALIFYING = [
  "seattle", "bellevue", "redmond", "kirkland", "new york", "austin", "chicago", "boston", "denver", "atlanta",
  "bangalore", "bengaluru", "hyderabad", "pune", "mumbai", "chennai", "delhi", "noida", "gurgaon",
  "mexico city", "guadalajara", "toronto", "vancouver", "montreal",
  "london", "dublin, ireland", "amsterdam", "berlin", "paris",
  "singapore", "sydney", "tokyo", "seoul", "bangkok",
];

// Non-US countries / regions. A "Remote - <foreign>" (Brazil/India/Canada/Ireland…)
// must fail even though it contains "remote" — the relaxed bare-remote rule was
// letting these through. Word-boundary so "india" ≠ "Indiana", "uk" ≠ "Paducah".
const FOREIGN_RE =
  /\b(india|brazil|canada|ireland|united kingdom|uk|emea|apac|latam|europe|mexico|colombia|argentina|chile|peru|philippines|poland|romania|ukraine|germany|france|spain|portugal|italy|netherlands|israel|egypt|nigeria|south africa|australia|new zealand|japan|korea|china|taiwan|hong kong|vietnam|indonesia|malaysia|thailand)\b/i;

// ── Scoring preferences (multi-user — PRD-multi-user §6.2 / D10) ─────────────
// The owner's literals above are now data: `checkLocation`/`matchScore` take an
// optional ScoringPrefs whose DEFAULT (`OWNER_PREFS`) reproduces the legacy
// behavior byte-for-byte — every engine call site passes nothing and is
// unchanged; the existing tests pin that default path. Members score against
// prefs built from their own UserPrefs (never the owner's lists).
export interface ScoringPrefs {
  /** Plain title substrings (regex-escaped before compilation — user input
   *  NEVER compiles into a raw regex). Empty ⇒ title component scores 0. */
  titleKeywords: string[];
  /** Acceptable location substrings (compared lowercased). Empty ⇒ neutral
   *  "anywhere": location passes at the vague 12/20 tier and neither the
   *  Bay-Area nor disqualifying-metro lists are applied. */
  locations: string[];
  /** Metro substrings that hard-fail a location. Only consulted when
   *  `locations` is non-empty (a neutral user has no metro blocklist). */
  disqualifiedMetros: string[];
  /** "onsite_ok" reproduces the owner's onsite-over-remote dampening
   *  (acceptable + remote scores 16, not 20); other values skip it. */
  remotePref: "remote_only" | "onsite_ok" | "no_preference";
  /** OWNER_PREFS only: enables the legacy tiered DE-title scoring (45/34/28
   *  via DE_TITLE_RE). User-built prefs use the flat keyword path instead. */
  ownerTitleTiers?: boolean;
}

// Owner literals, extracted (PRD-multi-user D10). `tejasDefaults()` in
// lib/prefs.ts mirrors titleKeywords/locations — keep them in sync (a test
// asserts this). titleKeywords is the plain-substring rendering of
// DE_TITLE_RE ("data infra" covers "data infrastructure"; the
// "(software|backend) engineer …data" tail is regex-only and stays in the
// ownerTitleTiers path).
export const OWNER_PREFS: ScoringPrefs = {
  titleKeywords: [
    "data engineer", "analytics engineer", "data platform", "data infra",
    "data pipeline", "data warehouse", "data warehousing", "database engineer",
    "big data engineer", "etl", "data architect", "dataops", "data ops",
  ],
  locations: BAY_AREA_CITIES,
  disqualifiedMetros: DISQUALIFYING,
  remotePref: "onsite_ok",
  ownerTitleTiers: true,
};

// Escape a user-supplied substring so it can join a regex alternation safely.
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-insensitive alternation over escaped keywords; null when empty.
export function keywordsRe(keywords: string[]): RegExp | null {
  const parts = keywords.map((k) => escapeRegExp(k.trim().toLowerCase())).filter(Boolean);
  return parts.length ? new RegExp(parts.join("|"), "i") : null;
}

export interface LocationVerdict {
  pass: boolean;
  reason: string;
}

// Accept if the listing names an acceptable location or a CA/US-remote option;
// reject if it names ONLY a disqualifying location; fail closed when unknown.
// With prefs whose `locations` is empty (neutral member), everything passes at
// the vague tier — the lists are the owner's preference, not an integrity gate.
export function checkLocation(location: string | undefined, prefs: ScoringPrefs = OWNER_PREFS): LocationVerdict {
  // Neutral "anywhere" (empty locations): no city list, no metro blocklist —
  // pass at the vague tier so matchScore's location component yields 12/20.
  if (prefs.locations.length === 0) return { pass: true, reason: "location_neutral" };

  if (!location || !location.trim()) return { pass: false, reason: "no_location" };
  const s = location.toLowerCase();

  const remoteCa = /remote.*(california|\bca\b|pacific)|(california|\bca\b).*remote/.test(s);
  const foreign = FOREIGN_RE.test(s);
  // "dublin" is ambiguous (Dublin, CA vs Dublin, Ireland) — only treat it as a
  // Bay-Area signal when no foreign country is named alongside it.
  const acceptable = prefs.locations.some(
    (c) => (c === "dublin" ? !foreign : true) && s.includes(c.toLowerCase()),
  );
  if (acceptable || remoteCa) return { pass: true, reason: "acceptable" };

  // A US/Bay token present anywhere means the role is US-available (so a
  // "US or India Remote" still passes); without one, a foreign country/region
  // (incl. "Remote - Brazil", "Dublin, Ireland") is rejected before bare-remote.
  const usToken = /(united states|u\.s\.?|\busa?\b)/.test(s);
  if (foreign && !usToken) return { pass: false, reason: "foreign_location" };

  // Reject disqualifying US-non-Bay metros (Seattle/Bellevue/NYC…) too.
  if (prefs.disqualifiedMetros.some((c) => s.includes(c.toLowerCase()))) return { pass: false, reason: "disqualifying_location" };

  // Sources are H1B + US/Bay-Area scoped, so accept the ambiguous values the
  // boards emit (bare "Remote", "United States", "Multiple Locations"). These
  // still score lower than a named Bay-Area city (see matchScore).
  if (/\bremote\b/.test(s)) return { pass: true, reason: "remote_unspecified" };
  if (usToken) return { pass: true, reason: "us" };
  if (/\bmultiple\b|\d+\+?\s*locations?/.test(s)) return { pass: true, reason: "multi_location" };

  return { pass: false, reason: "location_not_recognized" };
}

// ── Canonical dedup key (per-ATS) ─────────────────────────────────────────────
// The same posting appears under different URLs across sources, so dedup on a
// stable per-ATS key, not the raw URL. From _job_scraping_instruction.md Step 3.
export interface CanonicalKey {
  board: "Greenhouse" | "Lever" | "Ashby" | "Workday" | "LinkedIn" | "Other";
  key: string;
}

export function canonicalJobKey(url: string | undefined): CanonicalKey {
  if (!url) return { board: "Other", key: "" };
  const u = url.trim();

  // Greenhouse: job-boards/boards.greenhouse.io/{org}/jobs/{id}  OR  embed?for={org}&token={id}
  let m = u.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([^/&?]+)[^]*?(?:jobs\/|token=)(\d+)/i);
  if (m) return { board: "Greenhouse", key: `greenhouse:${m[1].toLowerCase()}:${m[2]}` };

  // Lever: jobs.lever.co/{org}/{uuid-or-id}
  m = u.match(/jobs\.lever\.co\/([^/]+)\/([0-9a-f-]{6,})/i);
  if (m) return { board: "Lever", key: `lever:${m[1].toLowerCase()}:${m[2].toLowerCase()}` };

  // Ashby: jobs.ashbyhq.com/{org}/{uuid}
  m = u.match(/jobs\.ashbyhq\.com\/([^/]+)\/([0-9a-f-]{6,})/i);
  if (m) return { board: "Ashby", key: `ashby:${m[1].toLowerCase()}:${m[2].toLowerCase()}` };

  // Workday: {tenant}.wdN.myworkdayjobs.com/.../{requisition id}
  m = u.match(/https?:\/\/([^.]+)\.wd\d+\.myworkdayjobs\.com\/[^]*?\/([A-Za-z0-9_-]+)\/?(?:\?|#|$)/i);
  if (m) return { board: "Workday", key: `workday:${m[1].toLowerCase()}:${m[2].toLowerCase()}` };

  // LinkedIn job IDs sit either right after /view/ or at the END of a slug,
  // e.g. /jobs/view/sr-data-engineer-at-tesla-4420225049 — capture both so these
  // aren't misfiled as board "Other".
  const li = u.match(/linkedin\.com\/jobs\/view\/(?:[^/?#]*?-)?(\d{6,})/i);
  if (li) return { board: "LinkedIn", key: `linkedin:${li[1]}` };

  // Fallback: normalized URL (strip protocol, query, trailing slash).
  const norm = u.replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
  return { board: "Other", key: `url:${norm}` };
}

// ── Canonical posting URL (durable, query-stripped) ───────────────────────────
// The URLs boards/Apify emit are fragile: LinkedIn carries position/refId/tracking
// params that can rot to a dead-end, Greenhouse varies by host (boards. vs
// job-boards.greenhouse.io), Workday sometimes includes an /en-US/ locale segment.
// Rewrite each to its stable canonical form so the stored link stays clickable.
// Mirrors canonicalJobKey's per-board parsing; canonicalJobKey(canonicalUrl(u))
// equals canonicalJobKey(u), so dedup keys are unaffected.
export function canonicalUrl(url: string | undefined): string {
  if (!url) return "";
  const u = url.trim();

  // Greenhouse → canonical job-boards host, no query (boards.greenhouse.io 301s here).
  let m = u.match(/greenhouse\.io\/(?:embed\/job_app\?for=)?([^/&?]+)[\s\S]*?(?:jobs\/|token=)(\d+)/i);
  if (m) return `https://job-boards.greenhouse.io/${m[1]}/jobs/${m[2]}`;

  // Lever → jobs.lever.co/{org}/{id}, no query.
  m = u.match(/jobs\.lever\.co\/([^/]+)\/([0-9a-f-]{6,})/i);
  if (m) return `https://jobs.lever.co/${m[1]}/${m[2]}`;

  // Ashby → jobs.ashbyhq.com/{org}/{id}, no query.
  m = u.match(/jobs\.ashbyhq\.com\/([^/]+)\/([0-9a-f-]{6,})/i);
  if (m) return `https://jobs.ashbyhq.com/${m[1]}/${m[2]}`;

  // LinkedIn → bare /jobs/view/{id} (drop the slug prefix + all tracking params).
  const li = u.match(/linkedin\.com\/jobs\/view\/(?:[^/?#]*?-)?(\d{6,})/i);
  if (li) return `https://www.linkedin.com/jobs/view/${li[1]}`;

  // Workday → drop a leading locale segment (/en-US/) + any query/hash, keeping the
  // consistent {host}/{site}{externalPath} form (the requisition id lives in the path).
  const wd = u.match(/^https?:\/\/([a-z0-9-]+\.wd\d+\.myworkdayjobs\.com)\/([\s\S]*)$/i);
  if (wd) {
    const path = wd[2].replace(/^[a-z]{2}-[A-Z]{2}\//, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    return `https://${wd[1]}/${path}`;
  }

  // Other → leave UNTOUCHED. We can't safely strip the query here: custom-domain
  // Greenhouse career sites (pinterestcareers.com, instacart.careers, …) carry the
  // job id ONLY in ?gh_jid=, and some SPAs route via the #fragment — dropping either
  // dead-ends the link. The id is in the path for every branch we DO rewrite above.
  return u;
}

// ── Role identity (company + normalized title) ────────────────────────────────
// A coarser key than canonicalJobKey: identifies the SAME ROLE across distinct
// postings — the same job on LinkedIn vs the company's own board, or a re-post
// under a new requisition id. Used to avoid resurrecting a role the user already
// actioned. Sr./Jr. normalized so "Sr. Data Engineer" and "Senior Data Engineer"
// collapse; the FULL title is slugified (never truncated) so genuinely different
// roles that share a prefix (e.g. two Snowflake "Senior Software Engineer…") stay
// distinct.
export function titleSlug(title: string | undefined): string {
  return (title ?? "")
    .toLowerCase()
    .replace(/\bsr\.?\b/g, "senior")
    .replace(/\bjr\.?\b/g, "junior")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
export function roleKey(company: string | undefined, title: string | undefined): string {
  return `${normalizeCompany(company)}::${titleSlug(title)}`;
}

// ── Freshness ─────────────────────────────────────────────────────────────────
// Verify a posting's own date is inside the window; fail closed when undated
// (Apify's posted_after filter is unreliable — see SOP Step 2).
export function isFresh(postedAt: string | undefined, windowDays: number | undefined): boolean {
  if (!windowDays) return true; // no window requested
  if (!postedAt) return false; // fail closed
  const t = new Date(postedAt).getTime();
  if (isNaN(t)) return false;
  return Date.now() - t <= windowDays * 86_400_000;
}

// ── Match score (0-100 deterministic fit) ─────────────────────────────────────
// All scraped rows already passed the H1B + DE-title + location gates, so this
// ranks the survivors by how well they fit Tejas's target (a DE role, Bay-Area,
// fresh, senior-but-not-exec). Explainable + cheap; folds in any relevance score
// the actor itself returned (`actorScore`, 0-1) when present.
export interface MatchInput {
  title?: string;
  location?: string;
  remote?: boolean;
  postedAt?: string;
  actorScore?: number; // 0-1, if the source provides one
}

export function matchScore(it: MatchInput, prefs: ScoringPrefs = OWNER_PREFS): number {
  const title = (it.title ?? "").toLowerCase();

  // Title relevance (max 45) — owner path: exact "data engineer" beats adjacent
  // specialties (legacy tiers, byte-for-byte). User-prefs path: flat 45 on any
  // escaped-keyword hit; empty keywords score 0 (neutral member, UI nudges).
  let titleScore = 0;
  if (prefs.ownerTitleTiers) {
    if (/\bdata engineer(ing)?\b/.test(title)) titleScore = 45;
    else if (/analytics engineer|data platform|data infra|data warehous|data pipeline|database engineer/.test(title)) titleScore = 34;
    else if (DE_TITLE_RE.test(title)) titleScore = 28;
  } else {
    const re = keywordsRe(prefs.titleKeywords);
    if (re && re.test(title)) titleScore = 45;
  }

  // Seniority fit (max 20) — mid/senior preferred; penalize lead/exec + junior.
  // Global, not a preference: it scores the LISTING title (PRD-multi-user §6.2).
  let seniority = 12;
  if (/\b(senior|sr\.?|staff|principal|lead)\b/.test(title)) seniority = 20;
  if (/\b(director|head|vp|vice president|manager)\b/.test(title)) seniority = 6;
  if (/\b(junior|jr\.?|associate|i{1,2}\b|entry)\b/.test(title)) seniority = 8;

  // Location quality (max 20) — named acceptable city best, then CA/US remote.
  const loc = checkLocation(it.location, prefs);
  let location = 0;
  // A named acceptable city ranks highest; the permissive US/remote/multi-
  // location (and the neutral "anywhere") passes rank lower since they're
  // geographically vaguer. Onsite-over-remote dampening is an "onsite_ok" pref.
  if (loc.pass) {
    location =
      loc.reason === "acceptable" ? (it.remote && prefs.remotePref === "onsite_ok" ? 16 : 20) : 12;
  }

  // Recency (max 15) — last 2d / week / month.
  let recency = 6;
  if (it.postedAt) {
    const t = Date.parse(it.postedAt);
    if (!Number.isNaN(t)) {
      const days = (Date.now() - t) / 86_400_000;
      recency = days <= 2 ? 15 : days <= 7 ? 11 : days <= 30 ? 6 : 2;
    }
  }

  let score = titleScore + seniority + location + recency; // 0-100

  // Blend the actor's own relevance (0-1) toward 100 when present.
  if (typeof it.actorScore === "number" && it.actorScore >= 0) {
    score = Math.round(0.7 * score + 0.3 * (it.actorScore * 100));
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Company-name normalization (for matching across sources) ──────────────────
export function normalizeCompany(name: string | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[.,]?\s*(inc|llc|ltd|corp|corporation|co|pbc|llp|gmbh|sa)\.?$/i, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}
