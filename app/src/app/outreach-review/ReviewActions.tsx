"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; note?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as { ok: boolean; error?: string; note?: string };
}

// Lead approval (B2): approve → status=approved, reject → rejected. No external calls.
export function LeadActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function act(action: "approve" | "reject") {
    if (action === "approve" && typeof window !== "undefined" &&
        !window.confirm("Approve this lead? It advances to email drafting.")) {
      return;
    }
    setBusy(true);
    setMsg("");
    const j = await post("/api/review/lead", { id, action });
    setBusy(false);
    if (!j.ok) return setMsg(j.error ?? "error");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => act("approve")}
        disabled={busy}
        className="text-[12px] font-medium px-3 py-1.5 rounded-md bg-status-green-fg text-white hover:opacity-90 disabled:opacity-50"
      >
        Approve
      </button>
      <button
        onClick={() => act("reject")}
        disabled={busy}
        className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-brand-border text-brand-body hover:bg-brand-canvas disabled:opacity-50"
      >
        Reject
      </button>
      {msg && <span className="text-[11px] text-status-red-fg">{msg}</span>}
    </div>
  );
}

// Draft review (B3): edit subject/body inline, then Approve (→ creates the Gmail
// draft, never sends), Save (keep editing), or Reject.
export function DraftActions({
  id,
  subject,
  body,
  hasEmail,
}: {
  id: string;
  subject: string;
  body: string;
  hasEmail: boolean;
}) {
  const router = useRouter();
  const [subj, setSubj] = useState(subject);
  const [text, setText] = useState(body);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function act(action: "approve" | "reject" | "edit") {
    if (action === "approve" && typeof window !== "undefined" &&
        !window.confirm(
          hasEmail
            ? "Create the labeled Gmail draft for this lead? It is never sent."
            : "Approve this draft? (No email on file — LinkedIn outreach stays manual.)",
        )) {
      return;
    }
    setBusy(true);
    setMsg("");
    const j = await post("/api/review/draft", { id, action, subject: subj, body: text });
    setBusy(false);
    if (!j.ok) return setMsg(j.error ?? "error");
    if (action === "edit") setMsg("Saved");
    else router.refresh();
  }

  return (
    <div className="space-y-2">
      <input
        value={subj}
        onChange={(e) => setSubj(e.target.value)}
        className="w-full text-[13px] font-medium px-3 py-2 rounded-md border border-brand-border bg-white"
        placeholder="Subject"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="w-full text-[13px] px-3 py-2 rounded-md border border-brand-border bg-white font-mono leading-relaxed"
        placeholder="Email body (3 paragraphs)"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => act("approve")}
          disabled={busy}
          className="text-[12px] font-medium px-3 py-1.5 rounded-md bg-status-green-fg text-white hover:opacity-90 disabled:opacity-50"
          title={hasEmail ? "Create the labeled Gmail draft (never sends)" : "No email — marks draft; LinkedIn outreach is manual"}
        >
          {hasEmail ? "Approve → Gmail draft" : "Approve (no email)"}
        </button>
        <button
          onClick={() => act("edit")}
          disabled={busy}
          className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-brand-border text-brand-body hover:bg-brand-canvas disabled:opacity-50"
        >
          Save edits
        </button>
        <button
          onClick={() => act("reject")}
          disabled={busy}
          className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-brand-border text-brand-body hover:bg-brand-canvas disabled:opacity-50"
        >
          Reject
        </button>
        {msg && <span className="text-[11px] text-brand-muted">{msg}</span>}
      </div>
    </div>
  );
}
