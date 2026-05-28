"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { classNames } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

// Tiny inline icon set — keeps bundle small and matches StarAdmin's
// thin-line aesthetic without pulling in lucide/heroicons.
const Icon = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[18px] h-[18px]">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  listings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[18px] h-[18px]">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h10M7 17h6" />
    </svg>
  ),
  outreach: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[18px] h-[18px]">
      <path d="M3 7l9 6 9-6" />
      <rect x="3" y="5" width="18" height="14" rx="2" />
    </svg>
  ),
  applications: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[18px] h-[18px]">
      <path d="M9 4h6l3 3v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M9 13l2 2 4-4" />
    </svg>
  ),
  interviews: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[18px] h-[18px]">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
      <circle cx="17" cy="6" r="2" />
      <path d="M15 12c1.5 0 4 1 4 4" />
    </svg>
  ),
  targets: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[18px] h-[18px]">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  ),
};

const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: Icon.dashboard },
  { href: "/listings", label: "Job Listings", icon: Icon.listings },
  { href: "/outreach", label: "Outreach", icon: Icon.outreach },
  { href: "/applications", label: "Applications", icon: Icon.applications },
  { href: "/interviews", label: "Interviews", icon: Icon.interviews },
  { href: "/targets", label: "Target Companies", icon: Icon.targets },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col w-[240px] shrink-0 border-r border-brand-border bg-white">
      <div className="px-6 h-16 flex items-center border-b border-brand-border">
        <Link href="/" className="text-[20px] font-semibold tracking-tight text-brand-heading">
          <span className="font-bold">Job</span>
          <span className="font-medium text-brand-ink">Dash</span>
        </Link>
      </div>
      <nav className="px-3 py-4">
        <p className="px-3 mb-2 text-[10px] uppercase tracking-wider text-brand-muted font-semibold">
          Pipeline
        </p>
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={classNames(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-[14px] transition-colors",
                    active
                      ? "bg-brand-ink/[0.08] text-brand-ink font-semibold"
                      : "text-brand-body hover:bg-brand-subtleBorder hover:text-brand-heading",
                  )}
                >
                  <span className={active ? "text-brand-ink" : "text-brand-muted"}>{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto px-6 py-4 border-t border-brand-border text-[11px] text-brand-muted">
        Source of truth: Airtable
      </div>
    </aside>
  );
}
