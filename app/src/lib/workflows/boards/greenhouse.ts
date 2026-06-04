// Greenhouse native board API — replaces the fuzzy Apify `companies_include`
// actor. boards-api returns EVERY live posting for a board token in one call,
// with structured location + updated_at, so coverage is complete + deterministic.
import { fetchJson, type RawJob } from "./types";

interface GhJob {
  title?: string;
  absolute_url?: string;
  first_published?: string; // when the posting first went live — the true "posted" date
  updated_at?: string; // last touched (refreshes); fallback only
  location?: { name?: string };
}
interface GhResp {
  jobs?: GhJob[];
}

export function parseGreenhouse(data: GhResp | null, company: string): RawJob[] {
  if (!data?.jobs) return [];
  return data.jobs
    .map((j) => ({
      title: j.title ?? "",
      company,
      url: j.absolute_url ?? "",
      location: j.location?.name || undefined,
      // Prefer first_published so the freshness window means "recently POSTED",
      // not "recently edited" (a long-open role gets its updated_at bumped).
      postedAt: j.first_published ?? j.updated_at,
    }))
    .filter((j) => j.title && j.url);
}

export async function fetchGreenhouse(token: string, company: string): Promise<RawJob[]> {
  // Default endpoint (no content=true) — we only need title/location/url/dates,
  // not the full HTML description, so this keeps the payload small at scale.
  const data = await fetchJson<GhResp>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs`,
  );
  return parseGreenhouse(data, company);
}
