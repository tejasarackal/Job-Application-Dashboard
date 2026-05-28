import { classNames } from "@/lib/utils";

interface SourceBadgeProps {
  source: "live" | "mock";
  className?: string;
}

// Tiny chip that tells the user whether a card is showing real data or
// fallback mock data. Helps debug missing env vars at a glance.
export function SourceBadge({ source, className }: SourceBadgeProps) {
  const live = source === "live";
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10.5px] font-medium",
        live
          ? "bg-status-teal-bg text-status-teal-fg"
          : "bg-status-yellow-bg text-status-yellow-fg",
        className,
      )}
      title={live ? "Live data from API" : "Mock data — set env vars to go live"}
    >
      <span
        className={classNames(
          "w-1.5 h-1.5 rounded-full",
          live ? "bg-status-teal-fg" : "bg-status-yellow-fg",
        )}
      />
      {live ? "Live" : "Mock"}
    </span>
  );
}
