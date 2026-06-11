"use client";

// "My target companies" editor (PRD-multi-user §7.6, D8, R-5, C3).
// One client island: local working state (mode + enabled-master set + custom
// list) → full-replace PUT /api/targets/user; the SERVER diffs to sparse
// deviation rows. Under view-as the selection renders read-only (checks
// visible, controls and save bar hidden) — assertWritable in the route is the
// real guarantee.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { classNames } from "@/lib/utils";
import type { StatusColor } from "@/lib/types";

// ── Props (server page supplies; shapes mirror lib/targets.ts) ───────────────

export interface EditorMasterRow {
  /** Canonical key = filters.ts#normalizeCompany(name) — computed server-side. */
  key: string;
  name: string;
  sector?: string;
  ats?: string;
  bayArea?: boolean;
}

export interface EditorDeviation {
  companyKey: string;
  status: "excluded" | "added";
  companyName?: string;
  careersUrl?: string;
  h1bVerified?: boolean;
}

type Mode = "h1b_all" | "none";

interface CustomRow {
  name: string;
  careersUrl?: string;
  /** Admin-set verification flag read back from the row (C3). New local adds
   *  are always unverified — the server never lets a client set this. */
  h1bVerified: boolean;
}

// Same ATS → palette treatment as the reference table on /targets.
const ATS_COLOR: Record<string, StatusColor> = {
  greenhouse: "green",
  lever: "blue",
  workday: "purple",
  custom: "orange",
  unknown: "gray",
};

// ── Baseline derivation (what the persisted deviations imply per mode) ───────

function enabledFor(mode: Mode, master: EditorMasterRow[], deviations: EditorDeviation[]): Set<string> {
  const masterKeys = new Set(master.map((m) => m.key));
  if (mode === "h1b_all") {
    const excluded = new Set(deviations.filter((d) => d.status === "excluded").map((d) => d.companyKey));
    return new Set(master.filter((m) => !excluded.has(m.key)).map((m) => m.key));
  }
  return new Set(
    deviations.filter((d) => d.status === "added" && masterKeys.has(d.companyKey)).map((d) => d.companyKey),
  );
}

function customsFrom(master: EditorMasterRow[], deviations: EditorDeviation[]): CustomRow[] {
  const masterKeys = new Set(master.map((m) => m.key));
  return deviations
    .filter((d) => d.status === "added" && !masterKeys.has(d.companyKey))
    .map((d) => ({
      name: d.companyName ?? d.companyKey,
      careersUrl: d.careersUrl,
      h1bVerified: d.h1bVerified === true,
    }));
}

function symmetricDiffSize(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const k of a) if (!b.has(k)) n++;
  for (const k of b) if (!a.has(k)) n++;
  return n;
}

function customDiffCount(current: CustomRow[], baseline: CustomRow[]): number {
  const key = (c: CustomRow) => c.name.trim().toLowerCase();
  const cur = new Map(current.map((c) => [key(c), c.careersUrl ?? ""]));
  const base = new Map(baseline.map((c) => [key(c), c.careersUrl ?? ""]));
  let n = 0;
  for (const [k, url] of cur) {
    if (!base.has(k) || base.get(k) !== url) n++;
  }
  for (const k of base.keys()) if (!cur.has(k)) n++;
  return n;
}

// Group-header checkbox with a real indeterminate state.
function GroupCheckbox({
  checked,
  indeterminate,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      className="h-3.5 w-3.5 accent-brand-ink"
    />
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────

export function TargetCompanyEditor({
  mode: savedMode,
  master,
  deviations,
  isViewAs,
}: {
  mode: Mode;
  master: EditorMasterRow[];
  deviations: EditorDeviation[];
  isViewAs: boolean;
}) {
  const router = useRouter();

  // Working state. Baselines (what's persisted, per mode) live in a ref and
  // are re-pointed after a successful save — props refresh async via
  // router.refresh(), so dirty math can never depend on them post-save.
  const baseline = useRef({
    mode: savedMode,
    byMode: {
      h1b_all: enabledFor("h1b_all", master, deviations),
      none: enabledFor("none", master, deviations),
    } as Record<Mode, Set<string>>,
    customs: customsFrom(master, deviations),
  });

  const [mode, setMode] = useState<Mode>(savedMode);
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(baseline.current.byMode[savedMode]));
  const [customs, setCustoms] = useState<CustomRow[]>(() => baseline.current.customs.map((c) => ({ ...c })));
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState("");

  // Add-company inline row.
  const [draftName, setDraftName] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [draftError, setDraftError] = useState("");

  const dirtyCount =
    (mode !== baseline.current.mode ? 1 : 0) +
    symmetricDiffSize(enabled, baseline.current.byMode[mode]) +
    customDiffCount(customs, baseline.current.customs);
  const dirty = dirtyCount > 0;

  // beforeunload guard while dirty (PRD §7.6).
  useEffect(() => {
    if (!dirty || isViewAs) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, isViewAs]);

  // Sector groups ("Other" fallback, alphabetical, Other last).
  const groups = useMemo(() => {
    const bySector = new Map<string, EditorMasterRow[]>();
    for (const m of master) {
      const sector = m.sector?.trim() || "Other";
      const list = bySector.get(sector) ?? [];
      list.push(m);
      bySector.set(sector, list);
    }
    return [...bySector.entries()].sort(([a], [b]) =>
      a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b),
    );
  }, [master]);

  const q = search.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);

  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    // Re-derive the selection from the persisted baseline for the new mode —
    // server-side inert curation (R-5) means flipping back restores exactly.
    setEnabled(new Set(baseline.current.byMode[next]));
  }

  function optOut() {
    if (!window.confirm(`Uncheck all ${master.length} default companies?`)) return;
    setMode("none");
    setEnabled(new Set(baseline.current.byMode.none));
  }

  function toggle(key: string, on: boolean) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function setMany(keys: string[], on: boolean) {
    setEnabled((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  }

  function addCustom() {
    const name = draftName.trim();
    if (name.length < 2 || name.length > 80) {
      setDraftError("Company names need 2–80 characters.");
      return;
    }
    if (customs.length >= 50) {
      setDraftError("Up to 50 custom companies.");
      return;
    }
    const lower = name.toLowerCase();
    if (
      customs.some((c) => c.name.trim().toLowerCase() === lower) ||
      master.some((m) => m.name.trim().toLowerCase() === lower)
    ) {
      setDraftError("That company is already in your list.");
      return;
    }
    const url = draftUrl.trim();
    setCustoms((prev) => [...prev, { name, ...(url ? { careersUrl: url } : {}), h1bVerified: false }]);
    setDraftName("");
    setDraftUrl("");
    setDraftError("");
  }

  function removeCustom(name: string) {
    setCustoms((prev) => prev.filter((c) => c.name !== name));
  }

  async function save() {
    setBusy(true);
    setError("");
    setSavedMsg("");
    try {
      const res = await fetch("/api/targets/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultMode: mode,
          selections: master.map((m) => ({ companyKey: m.key, enabled: enabled.has(m.key) })),
          custom: customs.map((c) => ({
            name: c.name,
            ...(c.careersUrl ? { careersUrl: c.careersUrl } : {}),
          })),
        }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok: boolean; counts?: { master: number; excluded: number; added: number; effective: number }; fieldErrors?: Record<string, string>; error?: string }
        | null;
      if (!j?.ok) {
        const fieldError = j?.fieldErrors ? Object.values(j.fieldErrors)[0] : undefined;
        setError(fieldError ?? j?.error ?? "Couldn't save. Your changes are still on this page — try again.");
        return;
      }
      // Re-baseline to the saved state (only the saved mode's set changed —
      // the other mode's deviations are inert under this save, R-5).
      baseline.current.mode = mode;
      baseline.current.byMode[mode] = new Set(enabled);
      baseline.current.customs = customs.map((c) => ({ ...c }));
      const counts = j.counts;
      if (counts) {
        setSavedMsg(`Saved · ${counts.effective - counts.added} sponsors, ${counts.added} custom`);
        window.setTimeout(() => setSavedMsg(""), 3000);
      }
      router.refresh();
    } catch {
      setError("Couldn't save. Your changes are still on this page — try again.");
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = enabled.size;
  const readOnly = isViewAs;

  return (
    <div>
      {/* Mode + opt-out */}
      <div className="px-6 pb-4 space-y-3">
        <div role="radiogroup" aria-label="Default targets" className="space-y-2">
          <label className="flex items-start gap-2 text-[13px] text-brand-body cursor-pointer">
            <input
              type="radio"
              name="targets-mode"
              checked={mode === "h1b_all"}
              disabled={readOnly}
              onChange={() => switchMode("h1b_all")}
              className="mt-0.5 accent-brand-ink"
            />
            <span>
              <span className="font-medium text-brand-heading">Start from the H1B sponsor list</span>
              <span className="block text-[12px] text-brand-muted">
                {master.length} verified sponsors as your baseline — uncheck the ones that don&apos;t fit.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-[13px] text-brand-body cursor-pointer">
            <input
              type="radio"
              name="targets-mode"
              checked={mode === "none"}
              disabled={readOnly}
              onChange={() => switchMode("none")}
              className="mt-0.5 accent-brand-ink"
            />
            <span>
              <span className="font-medium text-brand-heading">Start with an empty list</span>
              <span className="block text-[12px] text-brand-muted">
                Only companies you add yourself are in scope.
              </span>
            </span>
          </label>
        </div>
        {!readOnly && mode === "h1b_all" && (
          <button
            type="button"
            onClick={optOut}
            className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-brand-border text-brand-body hover:bg-brand-canvas"
          >
            Opt out of H1B defaults
          </button>
        )}
      </div>

      {/* Master list — collapses under "none" (the h1b_all radio is the undo) */}
      {mode === "h1b_all" ? (
        <>
          <div className="px-6 pb-3 flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies"
              aria-label="Search companies"
              className="text-[13px] px-3 py-1.5 rounded-md border border-brand-border bg-white w-full sm:w-[240px]"
            />
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-brand-canvas border border-brand-border text-[12px] font-medium text-brand-body tabular-nums">
              {selectedCount} / {master.length} selected
            </span>
            {!readOnly && (
              <span className="flex items-center gap-2 text-[12px]">
                <button
                  type="button"
                  onClick={() => setMany(master.map((m) => m.key), true)}
                  className="text-brand-ink font-medium hover:underline"
                >
                  Select all
                </button>
                <span className="text-brand-muted">·</span>
                <button
                  type="button"
                  onClick={() => setMany(master.map((m) => m.key), false)}
                  className="text-brand-ink font-medium hover:underline"
                >
                  Select none
                </button>
              </span>
            )}
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-brand-muted">
                  <th className="font-semibold px-6 py-3 border-b border-brand-border bg-brand-canvas/40 w-[36px]" />
                  <th className="font-semibold px-6 py-3 border-b border-brand-border bg-brand-canvas/40">Company</th>
                  <th className="font-semibold px-6 py-3 border-b border-brand-border bg-brand-canvas/40">Sector</th>
                  <th className="font-semibold px-6 py-3 border-b border-brand-border bg-brand-canvas/40">ATS</th>
                  <th className="font-semibold px-6 py-3 border-b border-brand-border bg-brand-canvas/40 text-center">Bay Area</th>
                  <th className="font-semibold px-6 py-3 border-b border-brand-border bg-brand-canvas/40 text-right" />
                </tr>
              </thead>
              <tbody>
                {groups.map(([sector, rows]) => {
                  const visible = rows.filter((r) => matches(r.name));
                  if (visible.length === 0) return null;
                  const selectedInGroup = rows.filter((r) => enabled.has(r.key)).length;
                  const allOn = selectedInGroup === rows.length;
                  return (
                    <SectorGroup
                      key={sector}
                      sector={sector}
                      rows={visible}
                      groupSize={rows.length}
                      selectedInGroup={selectedInGroup}
                      allOn={allOn}
                      readOnly={readOnly}
                      enabled={enabled}
                      onToggle={toggle}
                      onGroupToggle={(on) => setMany(rows.map((r) => r.key), on)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="px-6 pb-4 text-[12px] text-brand-muted">
          H1B defaults are off — {master.length} sponsor companies are out of scope. Select
          &ldquo;Start from the H1B sponsor list&rdquo; above to restore your previous selection.
        </p>
      )}

      {/* Custom companies (C3) */}
      <div className="px-6 pt-4 pb-2 border-t border-brand-subtleBorder">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-brand-muted">
          Custom companies
        </h3>
        <p className="text-[11px] text-brand-muted mt-1">
          Custom companies are tracked in your dashboard but are not scraped or researched
          automatically until they&apos;re verified.
        </p>
      </div>
      <div className="px-6 pb-4">
        {customs.length > 0 && (
          <ul className="divide-y divide-brand-subtleBorder">
            {customs.map((c) => (
              <li key={c.name} className="py-2.5 flex items-center gap-3">
                <span className="text-[13px] font-medium text-brand-heading min-w-0 truncate">{c.name}</span>
                {c.h1bVerified ? (
                  <StatusBadge label="H1B verified" color="green" />
                ) : (
                  <StatusBadge label="pending verification" color="orange" />
                )}
                {c.careersUrl && (
                  <a
                    href={c.careersUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] text-brand-ink hover:underline truncate max-w-[220px]"
                  >
                    careers page
                  </a>
                )}
                <span className="ml-auto flex items-center gap-3 shrink-0">
                  <Link
                    href={"/listings/new?company=" + encodeURIComponent(c.name)}
                    className="text-[12px] font-medium text-brand-ink hover:underline"
                  >
                    + Listing
                  </Link>
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`Remove ${c.name}`}
                      onClick={() => removeCustom(c.name)}
                      className="text-brand-muted hover:text-brand-heading text-[14px] leading-none"
                    >
                      ×
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {customs.length === 0 && (
          <p className="py-2 text-[12px] text-brand-muted">No custom companies yet.</p>
        )}

        {!readOnly && (
          <div className="mt-2 flex flex-wrap items-start gap-2">
            <input
              value={draftName}
              onChange={(e) => {
                setDraftName(e.target.value);
                setDraftError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              maxLength={80}
              placeholder="Company name"
              aria-label="Company name"
              className="text-[13px] px-3 py-1.5 rounded-md border border-brand-border bg-white w-full sm:w-[220px]"
            />
            <input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              placeholder="Careers URL (optional)"
              aria-label="Careers URL"
              className="text-[13px] px-3 py-1.5 rounded-md border border-brand-border bg-white w-full sm:w-[260px]"
            />
            <button
              type="button"
              onClick={addCustom}
              className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-brand-border text-brand-body hover:bg-brand-canvas"
            >
              Add company
            </button>
            {draftError && <p className="w-full text-[11px] text-status-red-fg">{draftError}</p>}
          </div>
        )}
      </div>

      {/* Sticky save bar */}
      {!readOnly && (
        <div className="sticky bottom-0 px-6 py-3 bg-white border-t border-brand-border rounded-b-card flex items-center gap-3">
          {dirty && (
            <span className="text-[11px] text-status-yellow-fg font-medium tabular-nums">
              {dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}
            </span>
          )}
          {savedMsg && <span className="text-[11px] text-brand-muted">{savedMsg}</span>}
          {error && <span className="text-[11px] text-status-red-fg">{error}</span>}
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className={classNames(
              "ml-auto text-[12px] font-medium px-4 py-2 rounded-md bg-brand-ink text-white hover:opacity-90 disabled:opacity-50",
            )}
          >
            {busy ? "Saving…" : "Save targets"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sector group (header row + company rows) ─────────────────────────────────

function SectorGroup({
  sector,
  rows,
  groupSize,
  selectedInGroup,
  allOn,
  readOnly,
  enabled,
  onToggle,
  onGroupToggle,
}: {
  sector: string;
  rows: EditorMasterRow[];
  groupSize: number;
  selectedInGroup: number;
  allOn: boolean;
  readOnly: boolean;
  enabled: Set<string>;
  onToggle: (key: string, on: boolean) => void;
  onGroupToggle: (on: boolean) => void;
}) {
  return (
    <>
      <tr className="bg-brand-canvas/60">
        <td className="px-6 py-2 border-b border-brand-subtleBorder">
          <GroupCheckbox
            checked={allOn}
            indeterminate={selectedInGroup > 0 && !allOn}
            disabled={readOnly}
            onChange={onGroupToggle}
            label={`Select all in ${sector}`}
          />
        </td>
        <td colSpan={5} className="px-6 py-2 border-b border-brand-subtleBorder">
          <span className="text-[12px] font-semibold text-brand-heading">{sector}</span>
          <span className="ml-2 text-[11px] text-brand-muted tabular-nums">
            {selectedInGroup} of {groupSize} selected
          </span>
        </td>
      </tr>
      {rows.map((r) => (
        <tr
          key={r.key}
          className="border-b border-brand-subtleBorder last:border-b-0 hover:bg-brand-canvas/60 transition-colors"
        >
          <td className="px-6 py-2.5">
            <input
              type="checkbox"
              aria-label={`Target ${r.name}`}
              checked={enabled.has(r.key)}
              disabled={readOnly}
              onChange={(e) => onToggle(r.key, e.target.checked)}
              className="h-3.5 w-3.5 accent-brand-ink"
            />
          </td>
          <td className="px-6 py-2.5 font-medium text-brand-heading">{r.name}</td>
          <td className="px-6 py-2.5 text-brand-body">{r.sector ?? "—"}</td>
          <td className="px-6 py-2.5">
            <StatusBadge label={r.ats} color={ATS_COLOR[r.ats ?? ""] ?? "gray"} />
          </td>
          <td className="px-6 py-2.5 text-center">
            {r.bayArea ? (
              <span className="text-status-teal-fg text-[14px]">✓</span>
            ) : (
              <span className="text-brand-muted">—</span>
            )}
          </td>
          <td className="px-6 py-2.5 text-right">
            <Link
              href={"/listings/new?company=" + encodeURIComponent(r.name)}
              className="text-[12px] font-medium text-brand-ink hover:underline whitespace-nowrap"
            >
              + Listing
            </Link>
          </td>
        </tr>
      ))}
    </>
  );
}
