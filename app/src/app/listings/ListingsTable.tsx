"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SortableTable, type SortableColumn } from "@/components/ui/SortableTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { classNames, formatRelative } from "@/lib/utils";
import type { JobListing } from "@/lib/types";

// Editable status control (e.g. triage new → skipped) — POSTs to /api/listings/{id}
// then refreshes so the row moves into its new status section.
const STATUS_OPTIONS = ["new", "queued", "approved", "applied", "review_pending", "skipped", "expired"];

function StatusSelect({ row }: { row: JobListing }) {
  const router = useRouter();
  const [value, setValue] = useState(row.status ?? "new");
  const [busy, setBusy] = useState(false);
  async function change(next: string) {
    if (next === value || busy) return;
    const prev = value;
    setValue(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch(`/api/listings/${row.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) setValue(prev);
      else router.refresh(); // re-group into the new status section
    } catch {
      setValue(prev);
    } finally {
      setBusy(false);
    }
  }
  return (
    <select
      value={value}
      disabled={busy}
      onChange={(e) => change(e.target.value)}
      title="Change status"
      className="text-[11.5px] rounded-md border border-brand-border bg-white px-1.5 py-1 text-brand-body capitalize cursor-pointer disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-brand-ink/30"
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {s.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}

// Date strings are "YYYY-MM-DD"; turn into epoch ms for numeric (desc-first)
// sorting, blank when absent so undated rows sink to the bottom.
const epoch = (s?: string): number | null => {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};

// Default order (and the stable tiebreak under any active column): most
// recently scraped first, then most recently posted, then best match — exactly
// the priority requested. Mirrors the server sort in airtable.ts#listJobListings
// so SSR and the interactive table agree (no reorder flash on hydration).
function freshness(a: JobListing, b: JobListing): number {
  return (
    (b.scrapedAt ?? "").localeCompare(a.scrapedAt ?? "") ||
    (b.postedAt ?? "").localeCompare(a.postedAt ?? "") ||
    (b.matchPct ?? -1) - (a.matchPct ?? -1)
  );
}

const columns: SortableColumn<JobListing>[] = [
  {
    key: "title",
    header: "Role",
    sortValue: (r) => r.title?.toLowerCase(),
    render: (r) => (
      <div>
        <p className="font-medium text-brand-heading">{r.title}</p>
        <p className="text-[11px] text-brand-muted">{r.company}</p>
      </div>
    ),
  },
  {
    key: "board",
    header: "Board",
    sortValue: (r) => r.board?.toLowerCase(),
    render: (r) => <StatusBadge label={r.board} />,
  },
  {
    key: "loc",
    header: "Location",
    sortValue: (r) => r.location?.toLowerCase(),
    render: (r) => (
      <span className="text-brand-body">
        {r.location ?? "—"}
        {r.remote && (
          <span className="ml-2 text-[10.5px] uppercase tracking-wider text-status-teal-fg font-semibold">
            Remote
          </span>
        )}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    sortValue: (r) => r.status?.toLowerCase(),
    render: (r) => <StatusSelect row={r} />,
  },
  {
    key: "match",
    header: "Match",
    numeric: true,
    sortValue: (r) => r.matchPct ?? null,
    render: (r) =>
      typeof r.matchPct === "number" ? (
        <span
          className={classNames(
            "text-[12px] font-semibold tabular-nums",
            r.matchPct >= 75
              ? "text-status-green-fg"
              : r.matchPct >= 50
              ? "text-status-teal-fg"
              : "text-brand-muted",
          )}
        >
          {r.matchPct}%
        </span>
      ) : (
        <span className="text-brand-muted text-[12px]">—</span>
      ),
  },
  {
    key: "posted",
    header: "Posted",
    numeric: true,
    sortValue: (r) => epoch(r.postedAt),
    render: (r) => <span className="text-brand-muted text-[12px]">{formatRelative(r.postedAt)}</span>,
  },
  {
    key: "scraped",
    header: "Scraped",
    numeric: true,
    sortValue: (r) => epoch(r.scrapedAt),
    render: (r) => <span className="text-brand-muted text-[12px]">{formatRelative(r.scrapedAt)}</span>,
  },
  {
    key: "link",
    header: "",
    align: "right",
    render: (r) =>
      r.url ? (
        <a
          href={r.url}
          target="_blank"
          rel="noreferrer"
          className="text-brand-ink hover:text-brand-inkHover text-[12px] font-medium"
        >
          Open ↗
        </a>
      ) : null,
  },
];

// Interactive listings table. Defaults to the freshness order (Scraped ▼) and
// lets the user re-sort by any column header. Used once per status section.
export function ListingsTable({ rows, empty }: { rows: JobListing[]; empty?: ReactNode }) {
  return (
    <SortableTable<JobListing>
      rowKey={(r) => r.id}
      rows={rows}
      columns={columns}
      empty={empty}
      initialSort={{ key: "scraped", dir: "desc" }}
      fallbackCompare={freshness}
    />
  );
}
