import { classNames } from "@/lib/utils";

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  empty?: React.ReactNode;
  rowKey: (row: T) => string;
}

// Lightweight table matching the StarAdmin "Hoverable Table" pattern:
// no card chrome here (the table is dropped inside a Card body), zebra rows
// off, only horizontal rules between rows, hover highlight.
export function DataTable<T>({ columns, rows, empty, rowKey }: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-[13px] text-brand-muted">
        {empty ?? "No records yet."}
      </div>
    );
  }
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-brand-muted">
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={classNames(
                  "font-semibold px-6 py-3 border-b border-brand-border bg-brand-canvas/40",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
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
  );
}
