// Lever native board API. One call returns all postings for an org, with a
// `categories.location` and an epoch-ms `createdAt`. Fills the gap where the old
// pipeline had NO Lever source at all (Plaid, Mistral, etc.).
import { fetchJson, type RawJob } from "./types";

interface LeverPosting {
  text?: string;
  hostedUrl?: string;
  createdAt?: number; // epoch ms
  workplaceType?: string; // "remote" | "on-site" | "hybrid"
  categories?: { location?: string; allLocations?: string[] };
}

export function parseLever(data: LeverPosting[] | null, company: string): RawJob[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((p) => ({
      title: p.text ?? "",
      company,
      url: p.hostedUrl ?? "",
      location: p.categories?.location ?? p.categories?.allLocations?.join(", ") ?? undefined,
      postedAt: typeof p.createdAt === "number" ? new Date(p.createdAt).toISOString() : undefined,
      remote: /remote/i.test(p.workplaceType ?? ""),
    }))
    .filter((j) => j.title && j.url);
}

export async function fetchLever(org: string, company: string): Promise<RawJob[]> {
  const data = await fetchJson<LeverPosting[]>(
    `https://api.lever.co/v0/postings/${encodeURIComponent(org)}?mode=json`,
  );
  return parseLever(data, company);
}
