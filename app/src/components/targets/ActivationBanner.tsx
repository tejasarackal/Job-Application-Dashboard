"use client";

// One-time dismissible activation banner (PRD-multi-user §7.8 — Targets is
// never empty, it's the activation surface). Dismissal is per-browser via
// localStorage; renders nothing until the client knows the dismiss state
// (avoids a hydration mismatch — a brief pop-in is the accepted trade).

import { useEffect, useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "targets-banner-dismissed";

export function ActivationBanner({ count }: { count: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(DISMISS_KEY) !== "1");
    } catch {
      setShow(true); // storage blocked — show; dismissal just won't persist
    }
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // non-persistent dismiss is fine
    }
    setShow(false);
  }

  return (
    <div className="bg-white border border-brand-border rounded-card shadow-card px-6 py-4 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-brand-heading">
          Your target list is ready — {count} verified H1B sponsors.
        </p>
        <p className="text-[12px] text-brand-muted mt-0.5">
          Remove companies that don&apos;t fit, add your own, then track your first listing.
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href="/listings/new"
          className="text-[12px] font-medium px-3 py-1.5 rounded-md bg-brand-ink text-white hover:opacity-90"
        >
          Looks good — add a listing
        </Link>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="text-brand-muted hover:text-brand-heading text-[16px] leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
