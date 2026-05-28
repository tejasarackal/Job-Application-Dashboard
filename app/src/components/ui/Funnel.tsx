import Link from "next/link";
import { classNames, pct } from "@/lib/utils";

interface FunnelProps {
  stages: Array<{ stage: string; count: number; href?: string }>;
  className?: string;
}

// Horizontal funnel bar — uses indigo accent so it reads as a primary
// brand chart, not a status chart. Each row shows count + conversion %
// against the top of the funnel. Rows with an `href` deep-link to their page.
export function Funnel({ stages, className }: FunnelProps) {
  const top = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className={classNames("space-y-3", className)}>
      {stages.map((s, i) => {
        const width = Math.max(4, Math.round((s.count / top) * 100));
        const rowClass = classNames(
          "flex items-center gap-4",
          s.href && "group rounded-md hover:bg-brand-canvas/60 transition-colors",
        );
        const inner = (
          <>
            <div className="w-28 text-[13px] text-brand-body font-medium shrink-0 group-hover:text-brand-ink">
              {s.stage}
            </div>
            <div className="flex-1 relative h-7 bg-brand-canvas rounded-md overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-brand-ink/85 transition-all group-hover:bg-brand-ink"
                style={{ width: `${width}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-end pr-3 text-[12px] font-semibold text-brand-heading">
                {s.count}
              </div>
            </div>
            <div className="w-12 text-[11px] text-brand-muted text-right shrink-0">
              {i === 0 ? "—" : pct(s.count, stages[0].count)}
            </div>
          </>
        );
        return s.href ? (
          <Link key={s.stage} href={s.href} className={rowClass}>
            {inner}
          </Link>
        ) : (
          <div key={s.stage} className={rowClass}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
