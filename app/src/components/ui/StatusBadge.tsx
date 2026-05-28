import type { StatusColor } from "@/lib/types";
import { classNames, statusColor } from "@/lib/utils";

const PALETTE: Record<StatusColor, string> = {
  blue: "bg-status-blue-bg text-status-blue-fg",
  cyan: "bg-status-cyan-bg text-status-cyan-fg",
  teal: "bg-status-teal-bg text-status-teal-fg",
  green: "bg-status-green-bg text-status-green-fg",
  yellow: "bg-status-yellow-bg text-status-yellow-fg",
  orange: "bg-status-orange-bg text-status-orange-fg",
  red: "bg-status-red-bg text-status-red-fg",
  pink: "bg-status-pink-bg text-status-pink-fg",
  purple: "bg-status-purple-bg text-status-purple-fg",
  gray: "bg-status-gray-bg text-status-gray-fg",
};

interface StatusBadgeProps {
  label?: string | null;
  color?: StatusColor;
  className?: string;
}

export function StatusBadge({ label, color, className }: StatusBadgeProps) {
  if (!label) return <span className="text-brand-muted text-[12px]">—</span>;
  const c = color ?? statusColor(label);
  return (
    <span
      className={classNames(
        "inline-flex items-center px-2 py-0.5 rounded-md text-[11.5px] font-medium",
        PALETTE[c],
        className,
      )}
    >
      {label}
    </span>
  );
}
