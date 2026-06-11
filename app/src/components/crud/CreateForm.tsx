"use client";

// Shared chrome for the four member create forms (PRD-multi-user §7.7):
// JSON POST → on ok full navigation (window.location.assign — the server
// list re-renders fresh) → on 422 inline field errors (ReviewActions
// pattern). Under view-as the form renders disabled with a one-line note —
// the API's assertWritable is the actual guarantee (D7).

import { useState } from "react";

export interface CreateResult {
  ok: boolean;
  id?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function postJson(url: string, body: unknown): Promise<CreateResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as CreateResult;
  } catch {
    return { ok: false, error: "Request failed. Your entries are still in the form — try again." };
  }
}

export function useCreateForm(action: string, doneHref: string) {
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(body: unknown) {
    setBusy(true);
    setFormError("");
    setFieldErrors({});
    const j = await postJson(action, body);
    if (j.ok) {
      // Full navigation so the server list re-renders with the new row.
      window.location.assign(doneHref);
      return;
    }
    setBusy(false);
    if (j.fieldErrors) setFieldErrors(j.fieldErrors);
    else setFormError(j.error ?? "Save failed. Your entries are still in the form — try again.");
  }

  return { busy, formError, fieldErrors, submit };
}

export function FormShell({
  onSubmit,
  busy,
  formError,
  readOnly,
  submitLabel,
  children,
}: {
  onSubmit: () => void;
  busy: boolean;
  formError: string;
  readOnly: boolean;
  submitLabel: string;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!readOnly && !busy) onSubmit();
      }}
    >
      {readOnly && (
        <p className="mb-4 text-[12px] text-brand-muted">Read-only in view-as mode.</p>
      )}
      <fieldset disabled={readOnly || busy} className="space-y-4">
        {children}
      </fieldset>
      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={readOnly || busy}
          className="text-[13px] font-medium px-4 py-2 rounded-md bg-brand-ink text-white hover:bg-brand-inkHover disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        {formError && <span className="text-[11px] text-status-red-fg">{formError}</span>}
      </div>
    </form>
  );
}
