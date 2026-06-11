"use client";

// View-as banner (PRD §7.3/D7) — full-width amber strip rendered ABOVE TopNav
// by the (app) layout, only when ctx.isViewAs. Pure props: the view-as cookie
// logic lives in lib/session.ts; exit calls the admin API (owned elsewhere)
// and hard-navigates back to /admin so the whole shell re-resolves.

import { useState } from "react";

export function ViewAsBanner({ targetEmail }: { targetEmail: string }) {
  const [exiting, setExiting] = useState(false);

  async function exitView() {
    setExiting(true);
    try {
      await fetch("/api/admin/view-as", { method: "DELETE" });
    } finally {
      window.location.assign("/admin");
    }
  }

  return (
    <div className="bg-status-yellow-bg text-status-yellow-fg text-[12px] px-4 md:px-6 py-2 flex items-center justify-between gap-3">
      <p className="min-w-0 truncate">
        Viewing as <span className="font-semibold">{targetEmail}</span> — read-only. All changes
        are disabled.
      </p>
      <button
        type="button"
        onClick={() => void exitView()}
        disabled={exiting}
        className="shrink-0 px-2.5 py-1 rounded-md border border-status-yellow-fg/40 font-medium hover:bg-status-yellow-fg/10 disabled:opacity-60"
      >
        {exiting ? "Exiting…" : "Exit view"}
      </button>
    </div>
  );
}
