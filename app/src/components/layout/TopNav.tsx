"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { classNames } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

// Tiny inline icon set — keeps the bundle small and matches StarAdmin's
// thin-line aesthetic without pulling in lucide/heroicons. (Mirrors the set
// that used to live in the sidebar.)
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
  workflows: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[18px] h-[18px]">
      <path d="M12 3v4M12 17v4M5 12H3M21 12h-2" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M6.5 6.5l1.5 1.5M16 16l1.5 1.5" />
    </svg>
  ),
  review: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[18px] h-[18px]">
      <path d="M4 5h16v11H7l-3 3z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-[18px] h-[18px]">
      <path d="M12 3l8 3v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
};

const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: Icon.dashboard },
  { href: "/listings", label: "Job Listings", icon: Icon.listings },
  { href: "/outreach", label: "Outreach", icon: Icon.outreach },
  { href: "/outreach-review", label: "Outreach Review", icon: Icon.review },
  { href: "/applications", label: "Applications", icon: Icon.applications },
  { href: "/interviews", label: "Interviews", icon: Icon.interviews },
  { href: "/targets", label: "Target Companies", icon: Icon.targets },
];

// Automation + admin surfaces — rendered only for `isAdmin && !isViewAs`.
// Hiding here is cosmetic; the (app)/(admin) layout is the real gate.
// (Outreach Review moved to NAV above — it's a per-user surface in Phase 3b.)
const AUTOMATION_NAV: NavItem[] = [
  { href: "/workflows", label: "Workflows", icon: Icon.workflows },
  { href: "/admin", label: "Admin", icon: Icon.admin },
];

function Tab({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <li className="shrink-0">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={classNames(
          "flex items-center gap-2 px-3 h-14 text-[13px] whitespace-nowrap border-b-2 transition-colors",
          active
            ? "border-brand-ink text-brand-ink font-semibold"
            : "border-transparent text-brand-body hover:text-brand-heading",
        )}
      >
        <span className={active ? "text-brand-ink" : "text-brand-muted"}>{item.icon}</span>
        {item.label}
      </Link>
    </li>
  );
}

// Top tab bar — replaces the old left sidebar. Pipeline tabs always render;
// the divider + automation/admin tabs render only for admins outside view-as
// (PRD §7.3). The strip scrolls horizontally on mobile so every page stays
// reachable on small screens.
export function TopNav({ isAdmin, isViewAs }: { isAdmin: boolean; isViewAs?: boolean }) {
  const pathname = usePathname();
  const showAdminTabs = isAdmin && !isViewAs;
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-brand-border">
      <div className="flex items-center gap-3 md:gap-5 px-4 md:px-6">
        <Link
          href="/"
          className="text-[20px] font-semibold tracking-tight text-brand-heading shrink-0"
        >
          <span className="font-bold">Job</span>
          <span className="font-medium text-brand-ink">Dash</span>
        </Link>
        <nav className="flex-1 min-w-0" aria-label="Primary">
          <ul className="flex items-stretch gap-0.5 overflow-x-auto no-scrollbar -mb-px">
            {NAV.map((item) => (
              <Tab key={item.href} item={item} active={isActive(item.href)} />
            ))}
            {showAdminTabs && (
              <>
                <li aria-hidden className="self-center mx-1.5 h-6 w-px bg-brand-border shrink-0" />
                {AUTOMATION_NAV.map((item) => (
                  <Tab key={item.href} item={item} active={isActive(item.href)} />
                ))}
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
