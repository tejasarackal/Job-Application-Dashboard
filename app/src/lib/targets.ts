// targets.ts — pure per-user target-company math (PRD-multi-user §6.4, D8).
// No I/O: the API route loads the live H1B master + the user's deviation rows
// and calls these. Hybrid model: Users."Default Targets" mode flag + sparse
// UserTargets deviation rows (`excluded` | `added`) — O(changes), not
// O(users × companies).
//
//   effectiveTargets(user) = (mode === "h1b_all" ? MASTER : ∅) − excluded + added
//
// Inert-curation rule (R-5): deviations that don't apply under the CURRENT
// mode (excluded rows in "none" mode; master-key added rows in "h1b_all")
// persist untouched, so flipping the mode back restores prior curation
// exactly. `diffTargets` therefore only creates/deletes rows that are
// *governable* under the submitted mode (customs are governable in both).

import { normalizeCompany } from "@/lib/workflows/filters";

export interface MasterCompany {
  /** Canonical key = filters.ts#normalizeCompany(name). */
  key: string;
  name: string;
  /** Passthrough for any extra master-row fields (careers URL, ATS, …). */
  [extra: string]: unknown;
}

export interface TargetDeviation {
  /** Airtable record id — present on rows read back, absent on creates. */
  id?: string;
  companyKey: string;
  status: "excluded" | "added";
  /** added rows only (display). */
  companyName?: string;
  /** added rows only (ATS-resolution hint). */
  careersUrl?: string;
  /** added rows only; ADMIN-set, never user-set (C3). */
  h1bVerified?: boolean;
}

export type DefaultTargetsMode = "h1b_all" | "none";

export interface EffectiveTargetCompany {
  key: string;
  name: string;
  /** "master" = lives in H1B_Companies (sponsor-verified by construction);
   *  "custom" = user-added row. */
  source: "master" | "custom";
  /** Masters are verified by construction; customs only when the admin has
   *  checked `H1B Verified`. */
  h1bVerified: boolean;
  /** C3: custom && !verified — visible in the UI ("pending verification"
   *  badge) but EXCLUDED from all proactive automation (scrape/research). */
  pendingVerification: boolean;
  careersUrl?: string;
}

// ── effectiveTargets ─────────────────────────────────────────────────────────

/** Compute the user's effective target set against the LIVE master list.
 *  Conflicting duplicate deviations for one key resolve conservatively
 *  (exclusion wins in h1b_all; first row wins within a status). */
export function effectiveTargets(
  master: MasterCompany[],
  mode: DefaultTargetsMode,
  deviations: TargetDeviation[],
): { companies: EffectiveTargetCompany[]; counts: { master: number; excluded: number; added: number; effective: number } } {
  const masterByKey = new Map(master.map((m) => [m.key, m]));

  // First deviation per (key,status) wins — code-enforced uniqueness upstream,
  // belt-and-suspenders here.
  const excluded = new Set<string>();
  const added = new Map<string, TargetDeviation>();
  for (const d of deviations) {
    if (d.status === "excluded") excluded.add(d.companyKey);
    else if (!added.has(d.companyKey)) added.set(d.companyKey, d);
  }

  const companies: EffectiveTargetCompany[] = [];
  const seen = new Set<string>();
  let excludedCount = 0;

  if (mode === "h1b_all") {
    for (const m of master) {
      if (excluded.has(m.key)) {
        excludedCount++;
        continue;
      }
      if (seen.has(m.key)) continue;
      seen.add(m.key);
      companies.push(toMasterTarget(m));
    }
  }

  let addedCount = 0;
  for (const [key, d] of added) {
    if (seen.has(key)) continue; // already in via master (redundant added row)
    if (mode === "h1b_all" && excluded.has(key)) continue; // conflict: exclusion wins
    const m = masterByKey.get(key);
    if (m) {
      // "none"-mode re-add of a master company. An inert exclusion for the
      // same key doesn't block it: exclusions only subtract from the master
      // base, which is empty under "none".
      seen.add(key);
      companies.push(toMasterTarget(m));
      addedCount++;
    } else {
      // Custom company — visible always; automation-gated on admin verify (C3).
      seen.add(key);
      const verified = d.h1bVerified === true;
      companies.push({
        key,
        name: d.companyName ?? key,
        source: "custom",
        h1bVerified: verified,
        pendingVerification: !verified,
        ...(d.careersUrl ? { careersUrl: d.careersUrl } : {}),
      });
      addedCount++;
    }
  }

  return {
    companies,
    counts: {
      master: master.length,
      excluded: excludedCount,
      added: addedCount,
      effective: companies.length,
    },
  };
}

function toMasterTarget(m: MasterCompany): EffectiveTargetCompany {
  const careersUrl = typeof m.careersUrl === "string" ? m.careersUrl : undefined;
  return {
    key: m.key,
    name: m.name,
    source: "master",
    h1bVerified: true,
    pendingVerification: false,
    ...(careersUrl ? { careersUrl } : {}),
  };
}

// ── diffTargets (full-replace PUT → sparse create/delete) ────────────────────

export interface TargetsPutInput {
  defaultMode: DefaultTargetsMode;
  /** Per-master-company toggles from the editor (keys not in master ignored). */
  selections: { companyKey: string; enabled: boolean }[];
  /** Custom companies from the editor; keyed by normalizeCompany(name). */
  custom: { name: string; careersUrl?: string }[];
}

/** Diff the client's full-replace desired state against the existing deviation
 *  rows. Pure + idempotent: running the same input against the post-apply rows
 *  yields empty create/delete. Existing rows matching on (companyKey, status)
 *  are KEPT as-is — never delete-and-recreate a custom row, that would wipe
 *  the admin-set `H1B Verified` flag (C3). Out-of-mode deviations persist
 *  inert (R-5). */
export function diffTargets(
  input: TargetsPutInput,
  master: MasterCompany[],
  existing: TargetDeviation[],
): { create: TargetDeviation[]; delete: string[]; mode: DefaultTargetsMode } {
  const mode = input.defaultMode;
  const masterByKey = new Map(master.map((m) => [m.key, m]));

  // Desired deviations under the submitted mode, keyed `${status}:${key}`.
  const desired = new Map<string, TargetDeviation>();

  for (const sel of input.selections) {
    const m = masterByKey.get(sel.companyKey);
    if (!m) continue; // unknown key — client noise, never mint a row for it
    if (mode === "h1b_all" && !sel.enabled) {
      desired.set(`excluded:${m.key}`, { companyKey: m.key, status: "excluded" });
    } else if (mode === "none" && sel.enabled) {
      desired.set(`added:${m.key}`, { companyKey: m.key, status: "added", companyName: m.name });
    }
  }

  for (const c of input.custom) {
    const name = c.name.trim();
    const key = normalizeCompany(name);
    if (!key) continue;
    if (masterByKey.has(key)) {
      // Name collides with a master company — it's not a custom. Under "none"
      // treat it as a re-add of the master row; under "h1b_all" it's already
      // targeted (unless explicitly excluded above — the exclusion stands).
      if (mode === "none") {
        const m = masterByKey.get(key)!;
        desired.set(`added:${key}`, { companyKey: key, status: "added", companyName: m.name });
      }
      continue;
    }
    if (desired.has(`added:${key}`)) continue; // duplicate custom — first wins
    desired.set(`added:${key}`, {
      companyKey: key,
      status: "added",
      companyName: name,
      ...(c.careersUrl ? { careersUrl: c.careersUrl } : {}),
      // h1bVerified intentionally absent: admin-set only (C3) — and existing
      // verified rows are matched on (key,status) and kept, never recreated.
    });
  }

  // Is this existing row governable under the submitted mode? (Out-of-mode
  // rows are inert curation — leave them alone so mode flips are reversible.)
  const governable = (d: TargetDeviation): boolean => {
    const isMaster = masterByKey.has(d.companyKey);
    if (!isMaster) return d.status === "added"; // customs governable in both modes; orphan exclusions inert
    return mode === "h1b_all" ? d.status === "excluded" : d.status === "added";
  };

  const create: TargetDeviation[] = [];
  const toDelete: string[] = [];
  const matched = new Set<string>(); // identity keys already satisfied by a kept row

  for (const row of existing) {
    if (!governable(row)) continue;
    const identity = `${row.status}:${row.companyKey}`;
    if (desired.has(identity) && !matched.has(identity)) {
      matched.add(identity); // keep (preserves id + admin-set fields)
    } else if (row.id) {
      // Undesired, or a duplicate of an already-kept identity — remove.
      toDelete.push(row.id);
    }
  }

  for (const [identity, d] of desired) {
    if (!matched.has(identity)) create.push(d);
  }

  return { create, delete: toDelete, mode };
}
