import { pct } from "@/lib/utils";

// Ratio suppression (PRD §7.8 S1): a derived percentage renders "—" while its
// denominator is < 5 — a 0% from pct() would conflate no-data with zero-rate.
export function pct5(part: number, total: number): string {
  if (total < 5) return "—";
  return pct(part, total);
}
