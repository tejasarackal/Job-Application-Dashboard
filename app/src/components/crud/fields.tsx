"use client";

// Shared form primitives for the member create forms (PRD-multi-user §7.7).
// Extends components/profile/fields.tsx (same house style: 13px body, 11px
// red helper for errors, sentence case) with the input types the create
// forms need: select, date/datetime, url, checkbox, textarea.

import { classNames } from "@/lib/utils";
import { FieldLabel, FieldError, FieldHelper } from "@/components/profile/fields";

const inputClass = (error?: string) =>
  classNames(
    "mt-1.5 w-full text-[13px] px-3 py-2 rounded-md border bg-white disabled:bg-brand-canvas disabled:text-brand-muted",
    error ? "border-status-red-fg" : "border-brand-border",
  );

// ── Input (text / email / url / date / datetime-local) ──────────────────────

export function InputField({
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
  type?: "text" | "email" | "url" | "date" | "datetime-local";
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
        className={inputClass(error)}
      />
      <FieldHelper helper={helper} />
      <FieldError error={error} />
    </div>
  );
}

// ── Select ───────────────────────────────────────────────────────────────────

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  required,
  helper,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  required?: boolean;
  helper?: string;
  error?: string;
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} htmlFor={id} />
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass(error)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldHelper helper={helper} />
      <FieldError error={error} />
    </div>
  );
}

// ── Checkbox ─────────────────────────────────────────────────────────────────

export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  helper,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  helper?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-2 text-[13px] text-brand-body">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded border-brand-border"
        />
        {label}
      </label>
      <FieldHelper helper={helper} />
    </div>
  );
}

// ── Textarea ─────────────────────────────────────────────────────────────────

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
  helper,
  error,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  helper?: string;
  error?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <FieldLabel label={label} htmlFor={id} />
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass(error)}
      />
      <FieldHelper helper={helper} />
      <FieldError error={error} />
    </div>
  );
}
