"use client";

// Profile "Connect Gmail" card (Phase 3b). Connecting lets the user's OWN
// application/interview sync run against their OWN mailbox (read-only, draft-
// only — never sends). Connect is a full navigation to the OAuth start route;
// disconnect POSTs and refreshes. The ?gmail= status from the callback surfaces
// as a one-line banner.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

const STATUS_COPY: Record<string, { tone: "ok" | "err"; text: string }> = {
  connected: { tone: "ok", text: "Gmail connected." },
  denied: { tone: "err", text: "Connection cancelled — nothing was changed." },
  error: { tone: "err", text: "Couldn’t complete the connection. Please try again." },
  norefresh: { tone: "err", text: "Google didn’t return a refresh token — try again and approve all prompts." },
  unconfigured: { tone: "err", text: "Gmail connection isn’t configured on the server yet." },
};

export function GmailCard({
  connected,
  gmailEmail,
  connectedAt,
  status,
}: {
  connected: boolean;
  gmailEmail?: string | null;
  connectedAt?: string | null;
  status?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const banner = status ? STATUS_COPY[status] : undefined;

  async function disconnect() {
    if (!window.confirm("Disconnect Gmail? Your synced applications and interviews stay; future syncs stop until you reconnect.")) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/gmail/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) setMsg(j.error ?? `Couldn’t disconnect (HTTP ${res.status}).`);
      else router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Gmail" subtitle="Connect your inbox to sync applications and interviews" />
      <CardBody>
        {banner && (
          <p className={`text-[12px] mb-3 ${banner.tone === "ok" ? "text-status-green-fg" : "text-status-red-fg"}`}>
            {banner.text}
          </p>
        )}
        {connected ? (
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-[13px] text-brand-body">
                Connected{gmailEmail ? <> as <span className="font-medium text-brand-heading">{gmailEmail}</span></> : ""}.
              </p>
              <p className="text-[11px] text-brand-muted mt-0.5">
                {connectedAt ? `Since ${connectedAt}. ` : ""}Used only to read your job-related email and create drafts — it never sends.
              </p>
            </div>
            <button
              onClick={disconnect}
              disabled={busy}
              className="shrink-0 text-[12px] font-medium px-3 py-1.5 rounded-md border border-brand-border text-brand-body hover:bg-brand-canvas disabled:opacity-50"
            >
              {busy ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : (
          <div>
            <p className="text-[13px] text-brand-body">
              Not connected. Connect your Google account to sync application and interview updates from your inbox.
            </p>
            <p className="text-[11px] text-brand-muted mt-1">
              You’ll see a “Google hasn’t verified this app” screen — that’s expected; choose Advanced → continue. Read + draft only; this app never sends email.
            </p>
            <a
              href="/api/gmail/connect"
              className="inline-block mt-3 bg-brand-ink text-white text-[12px] font-medium px-3 py-1.5 rounded-md hover:bg-brand-inkHover"
            >
              Connect Gmail
            </a>
          </div>
        )}
        {msg && <p className="mt-2 text-[12px] text-status-red-fg">{msg}</p>}
      </CardBody>
    </Card>
  );
}
