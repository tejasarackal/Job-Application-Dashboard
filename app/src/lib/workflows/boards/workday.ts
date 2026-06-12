// Workday CXS adapter — the public JSON search API, addressed per company by a
// "host|tenant|site" board_token so we cover ALL Workday sponsors (incl. vanity
// domains the old registry-derived path couldn't reach), not just 13.
//
// A single {limit:20, offset:0, searchText:"Data Engineer"} POST buried big
// sponsors' Bay-Area roles past the global top-20 (Salesforce/Intuit were missed).
// So we now search EACH DE keyword and PAGINATE each, deduping by requisition id —
// all bounded by a per-board deadline so one slow tenant can't sink the scrape.
import type { RawJob } from "./types";
import { DE_KEYWORDS } from "./keywords";

interface WorkdayPosting {
  title?: string;
  locationsText?: string;
  externalPath?: string;
  postedOn?: string;
}

const LIMIT = 20; // Workday's page size for this endpoint
const PAGE_CAP = 3; // ≤3 pages/keyword (60 results) — past this is rarely Bay-Area DE
const REQ_CAP = 120; // hard cap on unique reqs mapped per company
const PER_BOARD_MS = 8000; // a single tenant never consumes more than this (all its requests share one abort)

// Workday's postedOn is relative text ("Posted Today/Yesterday/N Days Ago/30+
// Days Ago"). Convert to an approximate ISO date; unrecognized → undefined (kept).
export function parseWorkdayPosted(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.toLowerCase();
  if (/today/.test(t)) return new Date().toISOString();
  if (/yesterday/.test(t)) return new Date(Date.now() - 86_400_000).toISOString();
  const d = t.match(/(\d+)\+?\s*day/);
  if (d) return new Date(Date.now() - Number(d[1]) * 86_400_000).toISOString();
  const mo = t.match(/(\d+)\+?\s*month/);
  if (mo) return new Date(Date.now() - Number(mo[1]) * 30 * 86_400_000).toISOString();
  return undefined;
}

// locationsText is vague for multi-location reqs ("2 Locations"); the externalPath
// carries the primary city slug ("/job/US-CA-Santa-Clara/…"). Combine both.
export function workdayLocation(p: WorkdayPosting): string {
  const slug = p.externalPath?.match(/\/job\/([^/]+)\//)?.[1]?.replace(/-/g, " ") ?? "";
  return `${p.locationsText ?? ""} ${slug}`.trim();
}

// Stable per-requisition key so the SAME role returned under multiple keyword
// searches (or pages) collapses to one. Workday externalPaths end in "…_JR12345"
// (or "…_R12345"); take the segment after the last "_", else the last path segment.
export function workdayReqId(externalPath: string | undefined): string {
  if (!externalPath) return "";
  const last = (externalPath.split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop() ?? "");
  const us = last.lastIndexOf("_");
  return (us >= 0 ? last.slice(us + 1) : last).toLowerCase();
}

// Pure: flatten keyword/page results, dedup by requisition id (first wins), and
// map to RawJob[]. Bounded by REQ_CAP. Network-free, so it's unit-tested directly.
export function parseWorkdayPostings(
  pages: WorkdayPosting[][],
  company: string,
  host: string,
  site: string,
): RawJob[] {
  const seen = new Set<string>();
  const out: RawJob[] = [];
  for (const page of pages) {
    for (const p of page) {
      const title = p.title ?? "";
      if (!title || !p.externalPath) continue;
      const id = workdayReqId(p.externalPath) || p.externalPath.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        title,
        company,
        url: `https://${host}/${site}${p.externalPath}`,
        location: workdayLocation(p) || undefined,
        postedAt: parseWorkdayPosted(p.postedOn),
      });
      if (out.length >= REQ_CAP) return out;
    }
  }
  return out;
}

// One CXS search page. null on any failure (non-200/abort) → caller treats as
// "no more for this keyword". Shares the board's AbortController so a stalled
// request is cancelled at the per-board deadline.
async function fetchWorkdayPage(
  host: string,
  tenant: string,
  site: string,
  searchText: string,
  offset: number,
  signal: AbortSignal,
): Promise<WorkdayPosting[] | null> {
  try {
    const res = await fetch(`https://${host}/wday/cxs/${tenant}/${site}/jobs`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: LIMIT, offset, searchText }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { jobPostings?: WorkdayPosting[] };
    return data.jobPostings ?? [];
  } catch {
    return null;
  }
}

// board_token = "host|tenant|site" (e.g. "nvidia.wd5.myworkdayjobs.com|nvidia|NVIDIAExternalCareerSite").
// opts.deadlineMs = the global scrape deadline (absolute ms); we never run past it,
// and never longer than PER_BOARD_MS regardless.
export async function fetchWorkdayBoard(
  token: string,
  company: string,
  opts: { deadlineMs?: number; keywords?: readonly string[] } = {},
): Promise<RawJob[]> {
  const [host, tenant, site] = (token || "").split("|");
  if (!host || !tenant || !site) return [];
  // Search the ACTOR's keywords (Phase 4); owner/cron pass DE_KEYWORDS. Empty → DE_KEYWORDS.
  const keywords = opts.keywords && opts.keywords.length ? opts.keywords : DE_KEYWORDS;

  const boardDeadline = Math.min(opts.deadlineMs ?? Date.now() + PER_BOARD_MS, Date.now() + PER_BOARD_MS);
  const ctrl = new AbortController();
  const abortTimer = setTimeout(() => ctrl.abort(), Math.max(0, boardDeadline - Date.now()));
  try {
    const pages: WorkdayPosting[][] = [];

    // Phase 1 — page 0 for every keyword, in parallel.
    const firsts = await Promise.all(
      keywords.map((kw) => fetchWorkdayPage(host, tenant, site, kw, 0, ctrl.signal)),
    );

    // Phase 2 — deeper pages ONLY for keywords whose page 0 filled (== LIMIT),
    // and only if we still have budget. Bounded by PAGE_CAP.
    const deeper: Array<Promise<WorkdayPosting[] | null>> = [];
    firsts.forEach((p, i) => {
      if (p?.length) pages.push(p);
      if (p && p.length >= LIMIT && Date.now() < boardDeadline) {
        for (let page = 1; page < PAGE_CAP; page++) {
          deeper.push(fetchWorkdayPage(host, tenant, site, keywords[i], page * LIMIT, ctrl.signal));
        }
      }
    });
    if (deeper.length) {
      for (const p of await Promise.all(deeper)) if (p?.length) pages.push(p);
    }

    return parseWorkdayPostings(pages, company, host, site);
  } catch {
    return [];
  } finally {
    clearTimeout(abortTimer);
  }
}

// ── Board-token detection helpers (used by detect_boards) ─────────────────────

function tenantOf(host: string): string {
  return host.split(".")[0];
}

// Pure: find a Workday tenant reference in a URL or HTML blob. Resolves vanity
// careers domains (careers.intuitive.com → the real intuitive.wdN tenant embedded
// in the page/redirect). Returns host + tenant always, and site when the source
// reveals one; otherwise the caller discovers the site by probing fallbacks.
export function extractWorkdayToken(
  text: string | undefined,
): { host: string; tenant: string; site?: string } | null {
  if (!text) return null;
  // (1) Most reliable — the CXS API path the careers SPA calls: /wday/cxs/{tenant}/{site}/jobs.
  const cxs = text.match(/([a-z0-9-]+\.wd\d+\.myworkdayjobs\.com)\/wday\/cxs\/([^/]+)\/([^/]+)/i);
  if (cxs) return { host: cxs[1], tenant: cxs[2], site: cxs[3] };
  // (2) A careers-site URL — {host}/{Site} (allow a locale like en-US/; never /wday).
  const site = text.match(/([a-z0-9-]+\.wd\d+\.myworkdayjobs\.com)\/(?:[a-z]{2}-[A-Z]{2}\/)?(?!wday\b)([A-Za-z0-9_-]+)/i);
  if (site) return { host: site[1], tenant: tenantOf(site[1]), site: site[2] };
  // (3) Host only — the site is discovered by probing common fallbacks.
  const host = text.match(/[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com/i);
  if (host) return { host: host[0], tenant: tenantOf(host[0]) };
  return null;
}

// Probe one candidate Workday site: is the CXS endpoint structurally valid (HTTP
// 200 + a jobPostings array), and how many DE roles does it surface? detect_boards
// uses `ok` to confirm a token works and `total` to pick the best site when
// repairing a mis-sited tenant (Salesforce: ExternalCareersPage → External_Career_Site).
export async function probeWorkdaySite(
  host: string,
  tenant: string,
  site: string,
  timeoutMs = 6000,
): Promise<{ ok: boolean; total: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://${host}/wday/cxs/${tenant}/${site}/jobs`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "data engineer" }),
    });
    if (!res.ok) return { ok: false, total: 0 };
    const data = (await res.json()) as { total?: number; jobPostings?: unknown[] };
    if (!Array.isArray(data.jobPostings)) return { ok: false, total: 0 };
    return { ok: true, total: typeof data.total === "number" ? data.total : data.jobPostings.length };
  } catch {
    return { ok: false, total: 0 };
  } finally {
    clearTimeout(timer);
  }
}
