interface HeaderProps {
  title: string;
  subtitle?: string;
}

// The page title bar — intentionally thin; page-level filters live inside cards,
// so the chrome stays uncluttered. Primary navigation lives in the TopNav above.
// Pages opt into dynamic rendering via `export const dynamic = "force-dynamic"`,
// so the date below is fresh on every request.
export function Header({ title, subtitle }: HeaderProps) {
  const today = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  return (
    <header className="min-h-16 border-b border-brand-border bg-white px-5 md:px-8 py-3 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[18px] md:text-[20px] font-semibold text-brand-heading leading-tight">{title}</h1>
        {subtitle && <p className="text-[12px] text-brand-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 border border-brand-border rounded-md text-[13px] text-brand-body">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4 text-brand-muted">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
          <span className="tabular-nums">{today}</span>
        </div>
        <div
          title="Tejas Arackal"
          className="w-8 h-8 rounded-full bg-brand-ink text-white flex items-center justify-center text-[12px] font-semibold shrink-0"
        >
          TA
        </div>
      </div>
    </header>
  );
}
