import { classNames } from "@/lib/utils";
import type { OutreachSource } from "@/lib/types";

interface BaseTagProps {
  source: OutreachSource;
  className?: string;
}

// Tiny chip indicating which Airtable base a row originated in. Keeps the
// merged Outreach view honest about where each contact lives.
export function BaseTag({ source, className }: BaseTagProps) {
  const label = source === "leads" ? "Leads" : "Outreach";
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border",
        source === "leads"
          ? "border-status-purple-bg bg-status-purple-bg text-status-purple-fg"
          : "border-status-blue-bg bg-status-blue-bg text-status-blue-fg",
        className,
      )}
      title={
        source === "leads"
          ? "Sourced via Automation Dev Outreach base"
          : "Tracked manually in Job Outreach base"
      }
    >
      {label}
    </span>
  );
}
