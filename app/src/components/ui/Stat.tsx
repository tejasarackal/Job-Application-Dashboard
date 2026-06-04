import { classNames } from "@/lib/utils";

interface StatProps {
  label: string;
  value: string | number;
  hint?: string;
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
  className?: string;
  // "lg" (default) for numbers; "sm" for text values (e.g. a stage name) that
  // would otherwise wrap and break the numeric-tile rhythm.
  size?: "lg" | "sm";
}

// Mirrors the StarAdmin KPI tile shape: small label up top, large value,
// subtle helper line underneath. No card chrome — used inside a Card.
export function Stat({ label, value, hint, trend, trendLabel, className, size = "lg" }: StatProps) {
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  const trendColor =
    trend === "up"
      ? "text-status-green-fg"
      : trend === "down"
        ? "text-status-red-fg"
        : "text-brand-muted";

  return (
    <div className={classNames("flex flex-col gap-1", className)}>
      <span className="text-[11px] uppercase tracking-wider text-brand-muted font-semibold">
        {label}
      </span>
      <span
        className={classNames(
          "font-semibold text-brand-heading tabular-nums",
          size === "sm" ? "text-[18px] leading-tight" : "text-[28px] leading-none",
        )}
      >
        {value}
      </span>
      <div className="flex items-baseline gap-2 text-[12px]">
        {hint && <span className="text-brand-body">{hint}</span>}
        {trendLabel && (
          <span className={trendColor}>
            {arrow} {trendLabel}
          </span>
        )}
      </div>
    </div>
  );
}
