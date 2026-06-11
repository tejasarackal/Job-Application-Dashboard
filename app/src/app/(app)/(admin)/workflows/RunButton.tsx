"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface RunResponse {
  ok: boolean;
  error?: string;
  notes?: string;
  more?: boolean;
  cursor?: unknown;
}

// Drives a workflow under the Hobby limit: POSTs one bounded chunk at a time,
// passing the returned nextOffset, until the server reports `more: false`.
export function RunButton({ name, label }: { name: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    // Confirm before a live run — these trigger real work (scrapes write to
    // Airtable; Lead Research spends Apollo credits; Email Drafting spends
    // Anthropic), so guard against an accidental click.
    if (typeof window !== "undefined" &&
        !window.confirm(`Run "${label ?? name}" now? This triggers a live pipeline run.`)) {
      return;
    }
    setBusy(true);
    setMsg("Running…");
    try {
      let more = true;
      let cursor: unknown = undefined;
      let guard = 0;
      let lastNote = "";
      // guard*delay bounds total time: 60 × 2s ≈ 2min, enough for an Apify run to finish.
      while (more && guard++ < 60) {
        const res = await fetch(`/api/workflows/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger: "manual", cursor }),
        });
        const j = (await res.json()) as RunResponse;
        if (!j.ok) {
          setMsg(`Error: ${j.error ?? `HTTP ${res.status}`}`);
          setBusy(false);
          return;
        }
        lastNote = j.notes ?? "";
        setMsg(lastNote);
        more = Boolean(j.more);
        cursor = j.cursor;
        if (more) await new Promise((r) => setTimeout(r, 2000)); // pace polling
      }
      setMsg(lastNote || "Done");
      router.refresh();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 text-[13px] font-medium px-3 py-1.5 rounded-md bg-brand-ink text-white hover:bg-brand-inkHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy && (
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        {busy ? "Running…" : "Run"}
      </button>
      {msg && <p className="mt-2 text-[12px] text-brand-muted">{msg}</p>}
    </div>
  );
}
