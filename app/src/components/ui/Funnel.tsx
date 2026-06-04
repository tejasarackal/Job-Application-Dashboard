import Link from "next/link";
import { scaleLinear } from "d3-scale";
import { classNames, pct } from "@/lib/utils";
import type { StatusColor } from "@/lib/types";

// SVG fill per status color — the light "-bg" tints (matching the status badges)
// so the funnel reads as a consistent tone with its badge counterparts. A stage
// with no color falls back to the indigo brand accent.
const BAR_FILL: Record<StatusColor, string> = {
  blue: "#dbe7ff",
  cyan: "#d6f0f5",
  teal: "#cdf1e6",
  green: "#d8f0d4",
  yellow: "#fcecc1",
  orange: "#ffd9c5",
  red: "#ffd5d5",
  pink: "#fcd5ea",
  purple: "#e0d6f5",
  gray: "#e6e7ec",
};
const DEFAULT_FILL = "#1f3bb3"; // brand-ink — primary chart accent

interface FunnelProps {
  stages: Array<{ stage: string; count: number; href?: string; color?: StatusColor }>;
  className?: string;
}

// Horizontal funnel chart. Bars are D3-scaled (scaleLinear, domain 0→max) and
// rendered as SVG; React owns the SVG so this stays a server component (no DOM
// mutation). Each row shows count + conversion % against the top of the funnel;
// a zero count renders as an empty track (no misleading nub). Rows with an
// `href` deep-link to their detail page.
export function Funnel({ stages, className }: FunnelProps) {
  const top = Math.max(...stages.map((s) => s.count), 1);
  const x = scaleLinear().domain([0, top]).range([0, 100]);

  return (
    <div className={classNames("space-y-2", className)}>
      {stages.map((s, i) => {
        const fill = s.color ? BAR_FILL[s.color] : DEFAULT_FILL;
        const conv = i === 0 ? "—" : pct(s.count, stages[0].count);
        const rowClass = classNames(
          "flex items-center gap-3 rounded-md px-1 -mx-1 py-0.5",
          s.href && "group hover:bg-brand-canvas transition-colors",
        );
        const inner = (
          <>
            <div className="w-24 sm:w-32 shrink-0 text-[13px] font-medium text-brand-body group-hover:text-brand-ink">
              {s.stage}
            </div>
            <div className="flex-1 h-7 rounded-md bg-brand-canvas overflow-hidden">
              <svg
                className="w-full h-full"
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                role="img"
                aria-label={`${s.stage}: ${s.count}${i === 0 ? "" : ` (${conv} of ${stages[0].stage})`}`}
              >
                <title>{`${s.stage}: ${s.count}${i === 0 ? "" : ` · ${conv}`}`}</title>
                {s.count > 0 && <rect x={0} y={0} width={x(s.count)} height={10} fill={fill} />}
              </svg>
            </div>
            <div className="w-10 shrink-0 text-right text-[13px] font-semibold text-brand-heading tabular-nums">
              {s.count}
            </div>
            <div className="w-12 shrink-0 text-right text-[11px] text-brand-muted tabular-nums">
              {conv}
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
