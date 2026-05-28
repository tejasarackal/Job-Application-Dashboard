interface HeaderProps {
  title: string;
  subtitle?: string;
}

// The header is intentionally thin — page-level filters live inside cards,
// so the chrome stays uncluttered. Mirrors StarAdmin's slim top bar.
// Pages opt into dynamic rendering via `export const dynamic = "force-dynamic"`,
// so the date below is fresh on every request.
export function Header({ title, subtitle }: HeaderProps) {
  const today = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

  return (
    <header className="h-16 border-b border-brand-border bg-white px-8 flex items-center justify-between">
      <div>
        <h1 className="text-[20px] font-semibold text-brand-heading leading-tight">{title}</h1>
        {subtitle && <p className="text-[12px] text-brand-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 border border-brand-border rounded-md text-[13px] text-brand-body">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4 text-brand-muted">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
          {today}
        </div>
        <button
          type="button"
          aria-label="Search"
          className="w-9 h-9 rounded-md border border-brand-border flex items-center justify-center text-brand-muted hover:text-brand-ink hover:border-brand-ink/30 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Notifications"
          className="relative w-9 h-9 rounded-md border border-brand-border flex items-center justify-center text-brand-muted hover:text-brand-ink hover:border-brand-ink/30 transition-colors"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
            <path d="M6 8a6 6 0 1 1 12 0v5l1.5 3h-15L6 13V8z" />
            <path d="M10 19a2 2 0 0 0 4 0" />
          </svg>
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-status-orange-fg" />
        </button>
        <div className="flex items-center gap-2 pl-3 border-l border-brand-border">
          <div className="w-8 h-8 rounded-full bg-brand-ink text-white flex items-center justify-center text-[12px] font-semibold">
            TA
          </div>
        </div>
      </div>
    </header>
  );
}
