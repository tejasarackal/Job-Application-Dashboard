"use client";

// Account avatar + dropdown (PRD §7.1/§7.3). Pure props — no SessionProvider;
// the async Header feeds it from auth() server-side. signOut() comes from the
// next-auth v5 client (redirectTo, not the deprecated callbackUrl).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

interface UserMenuProps {
  name?: string | null;
  email: string;
  image?: string | null;
  isAdmin: boolean;
}

// Initials rule (PRD §7.1): first char of first + last word of the name;
// single word → first two chars; no name → first two chars of the email
// local part. Uppercased, max 2.
function initialsFor(name: string | null | undefined, email: string): string {
  const n = (name ?? "").trim();
  if (n) {
    const words = n.split(/\s+/);
    return (
      words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[words.length - 1][0]}`
    ).toUpperCase();
  }
  return (email.split("@")[0] ?? "").slice(0, 2).toUpperCase();
}

export function UserMenu({ name, email, image, isAdmin }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape closes + refocuses the trigger; click-outside closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const itemClass =
    "block w-full text-left px-4 py-2 text-[13px] text-brand-body hover:bg-brand-canvas hover:text-brand-heading";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        // Tooltip is the full name, never the email (PRD §7.1).
        title={name ?? undefined}
        onClick={() => setOpen((v) => !v)}
        className="block w-8 h-8 rounded-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-2"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- 32px avatar; next/image is overkill
          <img src={image} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <span className="w-8 h-8 rounded-full bg-brand-ink text-white flex items-center justify-center text-[12px] font-semibold">
            {initialsFor(name, email)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-full mt-2 w-56 bg-white border border-brand-border rounded-card shadow-cardHover py-1.5 z-40"
        >
          <div className="px-4 py-2">
            {name && <p className="text-[13px] font-semibold text-brand-heading truncate">{name}</p>}
            <p className="text-[12px] text-brand-muted truncate">{email}</p>
          </div>
          <div aria-hidden className="my-1 h-px bg-brand-subtleBorder" />
          <Link role="menuitem" href="/profile" className={itemClass} onClick={() => setOpen(false)}>
            Profile
          </Link>
          {isAdmin && (
            <Link role="menuitem" href="/admin" className={itemClass} onClick={() => setOpen(false)}>
              Admin console
            </Link>
          )}
          <div aria-hidden className="my-1 h-px bg-brand-subtleBorder" />
          <button
            role="menuitem"
            type="button"
            onClick={() => void signOut({ redirectTo: "/login" })}
            className="block w-full text-left px-4 py-2 text-[13px] text-status-red-fg hover:bg-status-red-bg/40"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
