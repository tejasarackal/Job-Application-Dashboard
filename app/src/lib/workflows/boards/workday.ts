// Workday CXS adapter — the public JSON search API, addressed per company by a
// "host|tenant|site" board_token so we cover ALL Workday sponsors (incl. vanity
// domains the old registry-derived path couldn't reach), not just 13.
import type { RawJob } from "./types";

interface WorkdayPosting {
  title?: string;
  locationsText?: string;
  externalPath?: string;
  postedOn?: string;
}

const SEARCH = { appliedFacets: {}, limit: 20, offset: 0, searchText: "Data Engineer" };

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

// board_token = "host|tenant|site" (e.g. "nvidia.wd5.myworkdayjobs.com|nvidia|NVIDIAExternalCareerSite").
export async function fetchWorkdayBoard(token: string, company: string): Promise<RawJob[]> {
  const [host, tenant, site] = (token || "").split("|");
  if (!host || !tenant || !site) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://${host}/wday/cxs/${tenant}/${site}/jobs`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(SEARCH),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { jobPostings?: WorkdayPosting[] };
    return (data.jobPostings ?? [])
      .map((p) => ({
        title: p.title ?? "",
        company,
        url: `https://${host}/${site}${p.externalPath ?? ""}`,
        location: workdayLocation(p) || undefined,
        postedAt: parseWorkdayPosted(p.postedOn),
      }))
      .filter((j) => j.title);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
