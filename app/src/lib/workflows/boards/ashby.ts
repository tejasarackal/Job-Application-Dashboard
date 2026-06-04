// Ashby native board API — the source the old pipeline completely lacked, which
// is exactly why Notion's "Data Engineer, People Analytics" (jobs.ashbyhq.com/
// notion/...) never appeared. One call returns all listed postings with
// publishedAt + isRemote + (secondary) locations.
import { fetchJson, type RawJob } from "./types";

interface AshbyJob {
  title?: string;
  jobUrl?: string;
  publishedAt?: string;
  location?: string;
  isRemote?: boolean;
  isListed?: boolean;
  secondaryLocations?: Array<{ location?: string }>;
}
interface AshbyResp {
  jobs?: AshbyJob[];
}

export function parseAshby(data: AshbyResp | null, company: string): RawJob[] {
  if (!data?.jobs) return [];
  return data.jobs
    .filter((j) => j.isListed !== false) // unlisted/internal postings are not public openings
    .map((j) => {
      const secondary = (j.secondaryLocations ?? []).map((s) => s.location).filter(Boolean).join(", ");
      const location = [j.location, secondary].filter(Boolean).join(", ");
      return {
        title: j.title ?? "",
        company,
        url: j.jobUrl ?? "",
        location: location || undefined,
        postedAt: j.publishedAt,
        remote: j.isRemote,
      };
    })
    .filter((j) => j.title && j.url);
}

export async function fetchAshby(org: string, company: string): Promise<RawJob[]> {
  const data = await fetchJson<AshbyResp>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=false`,
  );
  return parseAshby(data, company);
}
