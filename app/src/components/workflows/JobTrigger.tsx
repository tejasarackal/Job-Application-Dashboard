"use client";

// Member-facing workflow trigger (Phase 3a). Drives a per-user workflow under
// the Hobby 60s cap by POSTing one bounded chunk at a time until `more:false`,
// exactly like the admin RunButton — but with member-friendly copy, weekly-quota
// (429) handling, and an optional one-shot auto-start used right after
// onboarding ("finding your first jobs…"). The server runs it as the signed-in
// user and stamps results to them; this component never names an identity.

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface RunResponse {
  ok: boolean;
  error?: string;
  notes?: string;
  more?: boolean;
  cursor?: unknown;
  quota?: { used: number; cap: number; remaining: number };
}

interface Props {
  workflow: string; // "scrape_jobs" | "research"
  idleLabel: string; // e.g. "Find jobs"
  busyLabel?: string; // e.g. "Finding jobs…"
  autoStart?: boolean; // run once on mount (post-onboarding first landing)
  className?: string;
}

export function JobTrigger({ workflow, idleLabel, busyLabel = "Working…", autoStart = false, className }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const startedRef = useRef(false); // guard so autoStart fires exactly once

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMsg(busyLabel);
    try {
      let more = true;
      let cursor: unknown = undefined;
      let guard = 0;
      let lastNote = "";
      // 60 × 2s ≈ 2 min — enough for an Apify run to finish across chunks.
      while (more && guard++ < 60) {
        const res = await fetch(`/api/workflows/${workflow}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger: "manual", cursor }),
        });
        const j = (await res.json().catch(() => ({}))) as RunResponse;
        if (res.status === 429) {
          setMsg(j.error ?? "Weekly limit reached. It resets Monday.");
          setBusy(false);
          return;
        }
        if (!j.ok) {
          setMsg(j.error ? `Couldn’t complete: ${j.error}` : `Something went wrong (HTTP ${res.status}).`);
          setBusy(false);
          return;
        }
        lastNote = j.notes ?? lastNote;
        setMsg(lastNote || busyLabel);
        more = Boolean(j.more);
        cursor = j.cursor;
        if (more) await new Promise((r) => setTimeout(r, 2000));
      }
      setMsg(lastNote || "Done.");
      router.refresh(); // surface the new rows
    } catch (e) {
      setMsg(`Something went wrong: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [busy, busyLabel, router, workflow]);

  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      void run();
    }
  }, [autoStart, run]);

  return (
    <div className={className}>
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 text-[12px] font-medium px-3 py-1.5 rounded-md bg-brand-ink text-white hover:bg-brand-inkHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy && (
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        {busy ? busyLabel : idleLabel}
      </button>
      {msg && <p className="mt-2 text-[12px] text-brand-muted">{msg}</p>}
    </div>
  );
}
