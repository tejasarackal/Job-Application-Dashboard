"use client";

// Log-application form island (PRD-multi-user §7.7). POSTs /api/applications.
// Status options are the existing Applications.Status single-select values.

import { useState } from "react";
import { humanizeStatus } from "@/lib/utils";
import { InputField, SelectField } from "./fields";
import { FormShell, useCreateForm } from "./CreateForm";

const STATUS_OPTIONS = ["submitted", "interviewing", "offered", "rejected", "withdrawn", "ghosted"].map(
  (v) => ({ value: v, label: humanizeStatus(v) }),
);

const today = () => new Date().toISOString().slice(0, 10);

export function ApplicationForm({ readOnly }: { readOnly: boolean }) {
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [status, setStatus] = useState("submitted");
  const [submittedAt, setSubmittedAt] = useState(today());
  const { busy, formError, fieldErrors, submit } = useCreateForm("/api/applications", "/applications");

  return (
    <FormShell
      onSubmit={() => submit({ company, jobTitle, jobUrl, status, submittedAt })}
      busy={busy}
      formError={formError}
      readOnly={readOnly}
      submitLabel="Log application"
    >
      <InputField
        id="app-company"
        label="Company"
        required
        value={company}
        onChange={setCompany}
        maxLength={80}
        error={fieldErrors.company}
      />
      <InputField
        id="app-title"
        label="Job title"
        required
        value={jobTitle}
        onChange={setJobTitle}
        maxLength={120}
        placeholder="Senior Data Engineer"
        error={fieldErrors.jobTitle}
      />
      <InputField
        id="app-url"
        label="Posting URL"
        type="url"
        value={jobUrl}
        onChange={setJobUrl}
        placeholder="https://…"
        error={fieldErrors.jobUrl}
      />
      <SelectField
        id="app-status"
        label="Status"
        value={status}
        onChange={setStatus}
        options={STATUS_OPTIONS}
        error={fieldErrors.status}
      />
      <InputField
        id="app-submitted"
        label="Submitted on"
        type="date"
        value={submittedAt}
        onChange={setSubmittedAt}
        error={fieldErrors.submittedAt}
      />
    </FormShell>
  );
}
