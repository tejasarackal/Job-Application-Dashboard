// targets-server.ts — server-side assembly of a user's effective target set for
// the ENGINE (per-user scraping, PRD-multi-user Phase 3). The pure math lives in
// targets.ts; this loads the live inputs (H1B master, the user's mode + sparse
// deviation rows) and returns the set of normalized company keys that are
// SCRAPEABLE for that user:
//   master companies they kept  +  custom companies the admin has verified.
// pendingVerification customs are excluded (C3 — never scrape an unverified
// user-added company). Owner is handled by the caller (no key filter at all).

import { listTargets, listUserTargets } from "@/lib/airtable";
import { getUserRow } from "@/lib/users";
import { normalizeCompany } from "@/lib/workflows/filters";
import {
  effectiveTargets,
  type MasterCompany,
  type TargetDeviation,
  type DefaultTargetsMode,
} from "@/lib/targets";

/** Normalized company keys a given user may scrape this run. */
export async function scrapeableTargetKeys(email: string): Promise<Set<string>> {
  const [masterRows, deviationRows, row] = await Promise.all([
    listTargets(),
    listUserTargets(email),
    getUserRow(email),
  ]);

  const master: MasterCompany[] = masterRows.map((m) => ({
    key: normalizeCompany(m.employer),
    name: m.employer,
    careersUrl: m.careersUrl,
  }));

  const deviations: TargetDeviation[] = deviationRows.map((d) => ({
    id: d.id,
    companyKey: d.companyKey,
    status: d.status === "added" ? "added" : "excluded",
    companyName: d.companyName,
    careersUrl: d.careersUrl,
    h1bVerified: d.h1bVerified,
  }));

  const mode: DefaultTargetsMode = row?.defaultTargets === "none" ? "none" : "h1b_all";
  const { companies } = effectiveTargets(master, mode, deviations);
  return new Set(companies.filter((c) => !c.pendingVerification).map((c) => c.key));
}
