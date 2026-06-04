// Shared contract for native ATS board adapters. Each adapter hits a company's
// PUBLIC job-board JSON API and yields RawJob[] — the keys here are exactly what
// scrapeJobs#normalize() reads, so adapter output flows into the unchanged
// collectRows() filter/dedup/match pipeline. No Apify, no credentials.

export interface RawJob {
  title: string;
  company: string; // the full registry/target name → isH1bSponsor exact-matches
  url: string;
  location?: string;
  postedAt?: string; // ISO 8601 when available
  remote?: boolean;
}

// GET JSON with a bounded timeout. Returns null on any failure (non-200, network
// blip, abort) so one dead board never sinks the whole scrape — the caller treats
// null as "no jobs" and the coverage audit flags the 0-result company.
export async function fetchJson<T = unknown>(url: string, timeoutMs = 8000): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
