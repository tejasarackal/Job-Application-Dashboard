// detect_boards — resolves & repairs WORKDAY board tokens in Scrape_Targets so
// vanity-domain sponsors (careers.intuitive.com) and mis-sited tenants
// (Salesforce: ExternalCareersPage → External_Career_Site) become natively
// scrapable instead of silently invisible. For each candidate it derives a
// {host|tenant|site} board token — from an existing token, a myworkdayjobs careers
// URL, or by FOLLOWING a vanity careers URL and scanning the page for the real
// tenant — then PROBES the CXS endpoint (trying common site slugs) and writes the
// working token back. No send path, no Apify.
//
// Scope: Workday only. Greenhouse/Lever/Ashby tokens come from the registry and
// the LinkedIn f_C fallback covers everything else — Workday's vanity-domain
// tenants are the one gap with no derivable token.
//
// Loop-safety: the candidate set is driven by `coverageStatus` (NOT a job count),
// and every processed target is written a TERMINAL status ("detected"/"undetectable"),
// so it drops out of the next chunk's candidate set — the chunk loop always
// terminates. (Dry-run pages by offset since it doesn't write.)
import { extractWorkdayToken, probeWorkdaySite } from "./boards/workday";
import { listScrapeTargets, updateRecords, TABLES, FIELDS, primaryBase } from "@/lib/airtable";
import type { RunResult } from "./runLog";
import type { ScrapeTarget } from "@/lib/types";

const FETCH_TIMEOUT_MS = 6000;

// A board_token is usable iff it's the full "host|tenant|site" triple.
export function validBoardToken(tok: string | undefined): boolean {
  if (!tok) return false;
  const parts = tok.split("|");
  return parts.length === 3 && parts.every((p) => p.trim().length > 0);
}

// Common Workday external-site slugs to try when the derived site returns nothing.
// Ordered by prevalence; the tenant-cased variants catch sites like
// "NVIDIAExternalCareerSite". First structurally-valid site (preferring one with
// DE roles) wins.
export function siteFallbacks(tenant: string): string[] {
  const cap = tenant ? tenant.charAt(0).toUpperCase() + tenant.slice(1) : "";
  const upper = tenant.toUpperCase();
  return [
    "External_Career_Site",
    "ExternalCareersPage",
    "External",
    "careers",
    "Careers",
    "jobs",
    `${cap}ExternalCareerSite`,
    `${upper}ExternalCareerSite`,
    cap,
    tenant,
  ].filter(Boolean);
}

// Workday targets that are not yet confirmed working. Status-driven so processing
// (which writes a terminal status) always shrinks this set → the chunk loop ends.
export function workdayNeedsDetection(t: ScrapeTarget): boolean {
  return (
    t.ats === "workday" &&
    t.coverageStatus !== "detected" &&
    t.coverageStatus !== "undetectable"
  );
}

// Derive a starting {host, tenant, site?} for a target without hitting the network
// when possible (existing token / direct myworkdayjobs careers URL). Falls back to
// FOLLOWING a vanity careers URL and scanning the final URL + HTML for the tenant.
async function resolveCandidate(
  t: ScrapeTarget,
): Promise<{ host: string; tenant: string; site?: string } | null> {
  if (validBoardToken(t.boardToken)) {
    const [host, tenant, site] = (t.boardToken as string).split("|");
    return { host, tenant, site };
  }
  const fromUrl = extractWorkdayToken(t.careersUrl);
  if (fromUrl) return fromUrl;

  if (!t.careersUrl) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(t.careersUrl, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; job-dashboard/1.0)" },
    });
    const finalUrl = res.url || "";
    const html = await res.text().catch(() => "");
    return extractWorkdayToken(finalUrl) ?? extractWorkdayToken(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface DetectOutcome {
  token?: string;
  status: "detected" | "undetectable";
  note: string;
}

// Resolve a candidate, then probe its site + fallbacks; the first site with DE
// roles wins (else the first structurally-valid one keeps the token but flags it
// for a human if nothing validates).
async function detectOne(t: ScrapeTarget): Promise<DetectOutcome> {
  const cand = await resolveCandidate(t);
  if (!cand) return { status: "undetectable", note: `${t.company}: no Workday tenant found` };

  const sites = [cand.site, ...siteFallbacks(cand.tenant)].filter((s): s is string => Boolean(s));
  const tried = new Set<string>();
  let best: { site: string; total: number } | null = null;
  for (const site of sites) {
    if (tried.has(site)) continue;
    tried.add(site);
    const p = await probeWorkdaySite(cand.host, cand.tenant, site);
    if (p.ok && (!best || p.total > best.total)) best = { site, total: p.total };
    if (best && best.total > 0) break; // a site that surfaces DE roles — good enough
  }
  if (!best) return { status: "undetectable", note: `${t.company}: ${cand.host} — no valid site` };
  const token = `${cand.host}|${cand.tenant}|${best.site}`;
  return { token, status: "detected", note: `${t.company}: ${token} (${best.total} DE)` };
}

export async function detectBoards(
  o: { maxItems?: number; dryRun?: boolean; cursor?: { offset?: number } } = {},
): Promise<RunResult> {
  const maxItems = Math.min(Math.max(o.maxItems ?? 3, 1), 5);
  const targets = await listScrapeTargets({ fresh: true });
  const candidates = targets.filter(workdayNeedsDetection);

  // Real runs write terminal statuses, so the set shrinks each chunk → always read
  // from the front (offset 0). Dry runs don't write, so page by offset to preview all.
  const offset = (o.dryRun ? o.cursor?.offset : 0) ?? 0;
  const batch = candidates.slice(offset, offset + maxItems);

  const counts: Record<string, number> = {
    candidates: candidates.length,
    detected: 0,
    repaired: 0,
    undetectable: 0,
  };
  const notes: string[] = [];
  const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];

  for (const t of batch) {
    const r = await detectOne(t);
    notes.push(r.note);
    const fields: Record<string, unknown> = { [FIELDS.scrapeTargets.coverageStatus]: r.status };
    if (r.token) {
      const repaired = validBoardToken(t.boardToken) && t.boardToken !== r.token;
      fields[FIELDS.scrapeTargets.boardToken] = r.token;
      counts[repaired ? "repaired" : "detected"]++;
    } else {
      counts.undetectable++;
    }
    if (t.id) updates.push({ id: t.id, fields });
  }

  if (!o.dryRun && updates.length) await updateRecords(TABLES.scrapeTargets, primaryBase(), updates);

  // Dry run: advance the offset to preview the rest. Real run: more work remains
  // iff there were candidates beyond this batch (the set shrinks as we write).
  const next = offset + batch.length;
  const more = o.dryRun ? next < candidates.length : candidates.length > batch.length;
  return {
    counts,
    partial: more,
    cursor: more && o.dryRun ? { offset: next } : undefined,
    notes: `detect_boards: ${batch.length} of ${candidates.length} workday candidate(s)` +
      (notes.length ? ` — ${notes.slice(0, 8).join(" | ")}` : ""),
  };
}
