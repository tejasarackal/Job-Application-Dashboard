"use client";

import { useMemo, useState, type ReactNode } from "react";
import { classNames } from "@/lib/utils";

export interface SortableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
  // A column is sortable iff it provides a sortValue. Return a comparable
  // primitive; null/undefined/"" always sink to the bottom regardless of dir.
  sortValue?: (row: T) => string | number | null | undefined;
  // Numeric compare + default to descending on first click (dates/scores read
  // best newest/highest-first); string columns default to ascending (A→Z).
  numeric?: boolean;
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

interface SortableTableProps<T> {
  columns: SortableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  // The header that starts active (shows its arrow on first paint).
  initialSort?: SortState;
  // Stable tiebreak applied after the active column (and the sole order when no
  // sortable column is active) — e.g. the listings "freshness" ordering.
  fallbackCompare?: (a: T, b: T) => number;
}

// Client sibling of <DataTable>: same chrome, but the column headers are
// clickable to sort, with an asc/desc indicator. Sorting is in-memory on the
// rows already on the page (no refetch), so it's instant.
export function SortableTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  initialSort,
  fallbackCompare,
}: SortableTableProps<T>) {
  const [sort, setSort] = useState<SortState | undefined>(initialSort);

  const sorted = useMemo(() => {
    const active = sort ? columns.find((c) => c.key === sort.key && c.sortValue) : undefined;
    const out = [...rows];
    out.sort((a, b) => {
      if (active?.sortValue) {
        const av = active.sortValue(a);
        const bv = active.sortValue(b);
        const an = av == null || av === "";
        const bn = bv == null || bv === "";
        if (an !== bn) return an ? 1 : -1; // blanks last, independent of dir
        if (!an) {
          const r = active.numeric
            ? Number(av) - Number(bv)
            : String(av).localeCompare(String(bv));
          if (r !== 0) return sort!.dir === "asc" ? r : -r;
        }
      }
      return fallbackCompare ? fallbackCompare(a, b) : 0;
    });
    return out;
  }, [rows, sort, columns, fallbackCompare]);

  function toggle(col: SortableColumn<T>) {
    if (!col.sortValue) return;
    setSort((prev) =>
      prev?.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: col.numeric ? "desc" : "asc" },
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-[13px] text-brand-muted">
        {empty ?? "No records yet."}
      </div>
    );
  }

  return (
    <>
      {/* Mobile: stacked cards — a wide table can't fit a phone, so each row
          becomes a labeled card (first column is the card title). */}
      <ul className="md:hidden divide-y divide-brand-subtleBorder">
        {sorted.map((row) => (
          <li key={rowKey(row)} className="px-5 py-4 space-y-2">
            {columns.map((c, i) =>
              i === 0 || !c.header ? (
                <div key={c.key} className="text-[13px] text-brand-body">
                  {c.render(row)}
                </div>
              ) : (
                <div key={c.key} className="flex items-start justify-between gap-3">
                  <span className="text-[11px] uppercase tracking-wider text-brand-muted shrink-0">
                    {c.header}
                  </span>
                  <span className="text-[13px] text-brand-body text-right min-w-0">{c.render(row)}</span>
                </div>
              ),
            )}
          </li>
        ))}
      </ul>

      {/* Desktop: the full sortable table, horizontally scrollable as a fallback. */}
      <div className="hidden md:block w-full overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-brand-muted">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={classNames(
                    "font-semibold px-6 py-3 border-b border-brand-border bg-brand-canvas/40",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                  )}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c)}
                      title={`Sort by ${c.header || "this column"}`}
                      className={classNames(
                        "group inline-flex items-center gap-1 uppercase tracking-wider hover:text-brand-body transition-colors",
                        c.align === "right" && "flex-row-reverse",
                        c.align === "center" && "justify-center",
                        active && "text-brand-body",
                      )}
                    >
                      {c.header}
                      <span className="text-[9px] leading-none">
                        {active ? (
                          sort!.dir === "asc" ? "▲" : "▼"
                        ) : (
                          <span className="opacity-30 group-hover:opacity-60">↕</span>
                        )}
                      </span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-brand-subtleBorder last:border-b-0 hover:bg-brand-canvas/60 transition-colors"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={classNames(
                    "px-6 py-3 text-brand-body align-middle",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
