"use client";

// Log-interview form island (PRD-multi-user §7.7). POSTs /api/interviews.
// Stage/status options mirror the existing Interviews single-select values
// (pinned in the route; never minted via typecast).

import { useState } from "react";
import { InputField, SelectField, TextAreaField } from "./fields";
import { FormShell, useCreateForm } from "./CreateForm";

const STAGE_OPTIONS = [
  "Interview",
  "Recruiter Screen",
  "Technical Screen",
  "Take Home",
  "Hiring Manager",
  "System Design",
  "Behavioral",
  "Onsite / Final",
  "Offer",
].map((v) => ({ value: v, label: v }));

const STATUS_OPTIONS = ["Scheduled", "Awaiting Feedback", "Passed", "Rejected", "Cancelled", "Completed"].map(
  (v) => ({ value: v, label: v }),
);

export function InterviewForm({ readOnly }: { readOnly: boolean }) {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [stage, setStage] = useState("Interview");
  const [status, setStatus] = useState("Scheduled");
  const [scheduledAt, setScheduledAt] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [notes, setNotes] = useState("");
  const { busy, formError, fieldErrors, submit } = useCreateForm("/api/interviews", "/interviews");

  return (
    <FormShell
      onSubmit={() => submit({ company, role, stage, status, scheduledAt, interviewer, notes })}
      busy={busy}
      formError={formError}
      readOnly={readOnly}
      submitLabel="Log interview"
    >
      <InputField
        id="iv-company"
        label="Company"
        required
        value={company}
        onChange={setCompany}
        maxLength={80}
        error={fieldErrors.company}
      />
      <InputField
        id="iv-role"
        label="Role"
        required
        value={role}
        onChange={setRole}
        maxLength={120}
        placeholder="Senior Data Engineer"
        error={fieldErrors.role}
      />
      <SelectField
        id="iv-stage"
        label="Stage"
        value={stage}
        onChange={setStage}
        options={STAGE_OPTIONS}
        error={fieldErrors.stage}
      />
      <SelectField
        id="iv-status"
        label="Status"
        value={status}
        onChange={setStatus}
        options={STATUS_OPTIONS}
        error={fieldErrors.status}
      />
      <InputField
        id="iv-scheduled"
        label="Scheduled for"
        type="datetime-local"
        value={scheduledAt}
        onChange={setScheduledAt}
        error={fieldErrors.scheduledAt}
      />
      <InputField
        id="iv-interviewer"
        label="Interviewer"
        value={interviewer}
        onChange={setInterviewer}
        maxLength={80}
        error={fieldErrors.interviewer}
      />
      <TextAreaField
        id="iv-notes"
        label="Notes"
        value={notes}
        onChange={setNotes}
        maxLength={2000}
        error={fieldErrors.notes}
      />
    </FormShell>
  );
}
