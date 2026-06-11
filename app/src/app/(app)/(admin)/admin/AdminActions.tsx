"use client";

// Row actions for /admin (PRD §7.9): View as (enter the read-only view-as
// session) and Disable/Enable. Plus the chunk-looping migrate runner
// (RunButton pattern — POST until `more: false`).

import { useState } from "react";
import { useRouter } from "next/navigation";

const btnClass =
  "text-[12px] font-medium px-2.5 py-1 rounded-md border border-brand-border text-brand-body hover:bg-brand-canvas disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

export function AdminActions({
  email,
  accountStatus,
  isSelf,
}: {
  email: string;
  accountStatus: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function viewAs() {
    if (!window.confirm(`View the dashboard as ${email}? Read-only; this access is logged.`)) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/view-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setMsg(j.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return;
      }
      // Full navigation, not router.push — busts the client router cache so no
      // stale RSC payload from the admin identity survives (PRD §5.5).
      window.location.assign("/");
    } catch (e) {
      setMsg((e as Error).message);
      setBusy(false);
    }
  }

  async function toggle() {
    const action = accountStatus === "disabled" ? "enable" : "disable";
    const verb = action === "disable" ? "Disable" : "Enable";
    if (!window.confirm(`${verb} ${email}? Takes effect within about a minute.`)) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setMsg(j.error ?? `HTTP ${res.status}`);
      } else {
        router.refresh();
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {!isSelf && (
        <>
          <button onClick={viewAs} disabled={busy} className={btnClass}>
            View as
          </button>
          <button onClick={toggle} disabled={busy} className={btnClass}>
            {accountStatus === "disabled" ? "Enable" : "Disable"}
          </button>
        </>
      )}
      {msg && <span className="text-[11px] text-status-red-fg">{msg}</span>}
    </div>
  );
}

// ── Migrate runner ───────────────────────────────────────────────────────────

interface MigrateResponse {
  ok: boolean;
  error?: string;
  table?: string;
  patched?: number;
  scanned?: number;
  more?: boolean;
  cursor?: unknown;
}

export function MigrateButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState("");

  async function run() {
    if (
      !window.confirm(
        "Run the data migration now? Blank-owner rows are stamped with the owner email. Idempotent — re-runs are no-ops.",
      )
    ) {
      return;
    }
    setBusy(true);
    setLines([]);
    setStatus("Running…");
    const totals: Record<string, { patched: number; scanned: number }> = {};
    try {
      let more = true;
      let cursor: unknown = undefined;
      let guard = 0;
      while (more && guard++ < 100) {
        const res = await fetch("/api/admin/migrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cursor }),
        });
        const j = (await res.json().catch(() => ({}))) as MigrateResponse;
        if (!res.ok || !j.ok) {
          setStatus(`Error: ${j.error ?? `HTTP ${res.status}`}`);
          setBusy(false);
          return;
        }
        if (j.table && j.table !== "finalize") {
          const t = (totals[j.table] ??= { patched: 0, scanned: 0 });
          t.patched += j.patched ?? 0;
          t.scanned += j.scanned ?? 0;
        }
        setLines(
          Object.entries(totals).map(
            ([table, t]) => `${table}: ${t.patched} patched / ${t.scanned} scanned`,
          ),
        );
        more = Boolean(j.more);
        cursor = j.cursor;
      }
      setStatus("Migration complete. Owner account row verified.");
      router.refresh();
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 text-[13px] font-medium px-3 py-1.5 rounded-md bg-brand-ink text-white hover:bg-brand-inkHover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy ? "Running…" : "Run data migration"}
      </button>
      {status && <p className="mt-2 text-[12px] text-brand-muted">{status}</p>}
      {lines.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {lines.map((l) => (
            <li key={l.split(":")[0]} className="text-[12px] tabular-nums text-brand-muted">
              {l}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
