// refresh_scrape_targets — keeps the Scrape_Targets mart in sync with the
// human-maintained H1B_Companies table. H1B_Companies is dirty (duplicate name
// variants like "Visa"/"Visa USA"), so this dedups by normalizeCompany and adds
// any NEW company the scraper doesn't yet know about as `needs_detection`
// (carrying careers_url + linkedin_id so it's still reachable via the LinkedIn
// f_C fallback until its ATS board token is detected). Existing rows — with their
// already-detected ats/board_token — are left untouched, so detection results are
// never clobbered.
import { normalizeCompany } from "./filters";
import { listTargets, listScrapeTargets, createRecords, TABLES, FIELDS, primaryBase } from "@/lib/airtable";
import type { RunResult } from "./runLog";
import type { TargetCompany } from "@/lib/types";

// Prefer the most complete row among duplicate name variants.
function completeness(t: TargetCompany): number {
  return (t.careersUrl ? 2 : 0) + (t.ats && t.ats !== "unknown" && t.ats !== "custom" ? 1 : 0) + (t.linkedinId ? 1 : 0);
}

export async function refreshScrapeTargets(): Promise<RunResult> {
  const [seeds, existing] = await Promise.all([listTargets(), listScrapeTargets({ fresh: true })]);
  const have = new Set(existing.map((t) => t.normalizedName || normalizeCompany(t.company)));

  // Dedup H1B_Companies by normalized name, keeping the most complete variant.
  const byNorm = new Map<string, TargetCompany>();
  for (const s of seeds) {
    const k = normalizeCompany(s.employer);
    if (!k) continue;
    const cur = byNorm.get(k);
    if (!cur || completeness(s) > completeness(cur)) byNorm.set(k, s);
  }

  const f = FIELDS.scrapeTargets;
  const toCreate: Array<Record<string, unknown>> = [];
  for (const [k, s] of byNorm) {
    if (have.has(k)) continue; // already a target — keep its detected ats/token
    toCreate.push({
      [f.company]: s.employer,
      [f.normalizedName]: k,
      [f.ats]: s.ats && s.ats !== "" ? s.ats : "unknown",
      [f.careersUrl]: s.careersUrl ?? "",
      [f.linkedinId]: s.linkedinId ?? "",
      [f.bayArea]: Boolean(s.bayArea),
      [f.remoteOk]: Boolean(s.remoteFriendly),
      [f.coverageStatus]: "needs_detection",
    });
  }

  if (toCreate.length) await createRecords(TABLES.scrapeTargets, primaryBase(), toCreate);

  return {
    counts: { seeds: seeds.length, unique: byNorm.size, existing: existing.length, added: toCreate.length },
    partial: false,
    notes: `refresh: ${seeds.length} H1B rows → ${byNorm.size} unique; +${toCreate.length} new target(s) as needs_detection; ${existing.length} existing kept`,
  };
}
