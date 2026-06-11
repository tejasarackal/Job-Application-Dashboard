"use client";

// Shared form primitives for the onboarding wizard and the /profile cards
// (PRD §7.5: one validation dialect against PATCH /api/profile). Wave 3's
// /targets editor may reuse ChipInput.
//
// House style: 13px body, brand tokens, 11px red helper text for errors
// (the ReviewActions pattern). Sentence case, no exclamation marks.

import { useState } from "react";
import { classNames } from "@/lib/utils";

// ── Labels & errors ──────────────────────────────────────────────────────────

export function FieldLabel({
  label,
  required,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-[12px] font-medium text-brand-heading">
      {label}
      {required && <span className="text-brand-muted font-normal"> (required)</span>}
    </label>
  );
}

export function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-[11px] text-status-red-fg mt-1">{error}</p>;
}

export function FieldHelper({ helper }: { helper?: string }) {
  if (!helper) return null;
  return <p className="text-[11px] text-brand-muted mt-1">{helper}</p>;
}

// ── TextField ────────────────────────────────────────────────────────────────

export function TextField({
  id,
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
  helper,
  error,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: "text" | "email";
  placeholder?: string;
  helper?: string;
  error?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} htmlFor={id} />
      <input
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={classNames(
          "mt-1.5 w-full text-[13px] px-3 py-2 rounded-md border bg-white",
          error ? "border-status-red-fg" : "border-brand-border",
        )}
      />
      <FieldHelper helper={helper} />
      <FieldError error={error} />
    </div>
  );
}

// ── ChipInput — type + Enter adds, × removes ─────────────────────────────────

export function ChipInput({
  id,
  label,
  chips,
  onChange,
  required,
  placeholder,
  helper,
  error,
  maxChips = 10,
  minLen = 2,
  maxLen = 60,
}: {
  id: string;
  label: string;
  chips: string[];
  onChange: (chips: string[]) => void;
  required?: boolean;
  placeholder?: string;
  helper?: string;
  error?: string;
  maxChips?: number;
  minLen?: number;
  maxLen?: number;
}) {
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState("");

  function add() {
    const v = draft.trim();
    if (!v) return;
    if (v.length < minLen || v.length > maxLen) {
      setLocalError(`Each entry needs ${minLen}–${maxLen} characters.`);
      return;
    }
    if (chips.length >= maxChips) {
      setLocalError(`Up to ${maxChips} entries.`);
      return;
    }
    if (chips.some((c) => c.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return; // duplicate — silently ignore
    }
    onChange([...chips, v]);
    setDraft("");
    setLocalError("");
  }

  return (
    <div>
      <FieldLabel label={label} required={required} htmlFor={id} />
      <div
        className={classNames(
          "mt-1.5 flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-md border bg-white",
          error || localError ? "border-status-red-fg" : "border-brand-border",
        )}
      >
        {chips.map((chip) => (
          <span
            key={chip}
            className="inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full bg-brand-canvas border border-brand-border text-brand-body"
          >
            {chip}
            <button
              type="button"
              aria-label={`Remove ${chip}`}
              onClick={() => onChange(chips.filter((c) => c !== chip))}
              className="text-brand-muted hover:text-brand-heading leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={chips.length === 0 ? placeholder : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setLocalError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          className="flex-1 min-w-[120px] text-[13px] px-1 py-0.5 outline-none bg-transparent"
        />
      </div>
      <FieldHelper helper={helper} />
      <FieldError error={localError || error} />
    </div>
  );
}

// ── PillSelect — small exclusive pill group ──────────────────────────────────

export function PillSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  helper,
  error,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  helper?: string;
  error?: string;
}) {
  return (
    <div>
      <FieldLabel label={label} />
      <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={classNames(
                "text-[12px] font-medium px-3 py-1.5 rounded-full border transition-colors",
                active
                  ? "bg-brand-ink text-white border-brand-ink"
                  : "bg-white text-brand-body border-brand-border hover:bg-brand-canvas",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <FieldHelper helper={helper} />
      <FieldError error={error} />
    </div>
  );
}

// ── Shared option set (wizard + profile use the same dialect) ────────────────

export const REMOTE_PREF_OPTIONS: { value: "remote_only" | "onsite_ok" | "no_preference"; label: string }[] = [
  { value: "remote_only", label: "Remote only" },
  { value: "onsite_ok", label: "On-site OK" },
  { value: "no_preference", label: "No preference" },
];

export function remotePrefLabel(v: string | undefined): string {
  return REMOTE_PREF_OPTIONS.find((o) => o.value === v)?.label ?? "No preference";
}
