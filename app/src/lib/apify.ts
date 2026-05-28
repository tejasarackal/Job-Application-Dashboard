// Apify API client. We surface recent actor runs so the user can see whether
// the job scrapers are healthy (last run status + item counts).
import type { ApifyRun } from "./types";

const API = "https://api.apify.com/v2";

export function isConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

interface ApifyListResponse {
  data?: {
    items?: Array<{
      id: string;
      actId: string;
      actorTaskId?: string;
      status: string;
      startedAt: string;
      finishedAt?: string;
      stats?: { computeUnits?: number };
      meta?: { actorName?: string };
      defaultDatasetId?: string;
    }>;
  };
}

interface ApifyActorResponse {
  data?: { name?: string; title?: string };
}

interface ApifyDatasetResponse {
  data?: { itemCount?: number };
}

export async function recentRuns(limit = 10): Promise<ApifyRun[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("Apify not configured");

  const url = new URL(`${API}/actor-runs`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("desc", "true");
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`Apify ${res.status}`);
  const json = (await res.json()) as ApifyListResponse;
  const items = json.data?.items ?? [];

  // Resolve actor names and item counts concurrently. These calls add latency
  // but make the run list much more readable.
  const enriched = await Promise.all(
    items.map(async (it) => {
      let actorName = it.actId;
      let itemCount: number | undefined;
      try {
        const [aRes, dRes] = await Promise.all([
          fetch(`${API}/acts/${it.actId}`, {
            headers: { Authorization: `Bearer ${token}` },
            next: { revalidate: 3600 },
          }),
          it.defaultDatasetId
            ? fetch(`${API}/datasets/${it.defaultDatasetId}`, {
                headers: { Authorization: `Bearer ${token}` },
                next: { revalidate: 60 },
              })
            : Promise.resolve(undefined),
        ]);
        if (aRes && aRes.ok) {
          const a = (await aRes.json()) as ApifyActorResponse;
          actorName = a.data?.title || a.data?.name || actorName;
        }
        if (dRes && dRes.ok) {
          const d = (await dRes.json()) as ApifyDatasetResponse;
          itemCount = d.data?.itemCount;
        }
      } catch {
        // Best-effort enrichment only.
      }
      return {
        id: it.id,
        actorId: it.actId,
        actorName,
        status: it.status,
        startedAt: it.startedAt,
        finishedAt: it.finishedAt,
        itemCount,
      } satisfies ApifyRun;
    }),
  );
  return enriched;
}
