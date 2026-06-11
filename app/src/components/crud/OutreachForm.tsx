"use client";

// Log-outreach form island (PRD-multi-user §7.7). POSTs /api/outreach
// (the manual Outreach table). Channel/status options are the existing
// single-select values.

import { useState } from "react";
import { InputField, SelectField } from "./fields";
import { FormShell, useCreateForm } from "./CreateForm";

const CHANNEL_OPTIONS = ["Email", "LinkedIn", "Email+LinkedIn", "Phone"].map((v) => ({
  value: v,
  label: v === "Email+LinkedIn" ? "Email + LinkedIn" : v,
}));

const STATUS_OPTIONS = ["Drafted", "Sent", "Contacted", "Replied", "No Reply", "Interviewing", "Rejected"].map(
  (v) => ({ value: v, label: v }),
);

const today = () => new Date().toISOString().slice(0, 10);

export function OutreachForm({ readOnly }: { readOnly: boolean }) {
  const [company, setCompany] = useState("");
  const [contactName, setContactName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [channel, setChannel] = useState("Email");
  const [status, setStatus] = useState("Contacted");
  const [date, setDate] = useState(today());
  const { busy, formError, fieldErrors, submit } = useCreateForm("/api/outreach", "/outreach");

  return (
    <FormShell
      onSubmit={() => submit({ company, contactName, title, email, linkedin, channel, status, date })}
      busy={busy}
      formError={formError}
      readOnly={readOnly}
      submitLabel="Log outreach"
    >
      <InputField
        id="or-company"
        label="Company"
        required
        value={company}
        onChange={setCompany}
        maxLength={80}
        error={fieldErrors.company}
      />
      <InputField
        id="or-contact"
        label="Contact name"
        required
        value={contactName}
        onChange={setContactName}
        maxLength={80}
        error={fieldErrors.contactName}
      />
      <InputField
        id="or-title"
        label="Contact title"
        value={title}
        onChange={setTitle}
        maxLength={100}
        placeholder="Engineering Manager, Data Platform"
        error={fieldErrors.title}
      />
      <InputField
        id="or-email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        error={fieldErrors.email}
      />
      <InputField
        id="or-linkedin"
        label="LinkedIn URL"
        type="url"
        value={linkedin}
        onChange={setLinkedin}
        placeholder="https://www.linkedin.com/in/…"
        error={fieldErrors.linkedin}
      />
      <SelectField
        id="or-channel"
        label="Channel"
        value={channel}
        onChange={setChannel}
        options={CHANNEL_OPTIONS}
        error={fieldErrors.channel}
      />
      <SelectField
        id="or-status"
        label="Status"
        value={status}
        onChange={setStatus}
        options={STATUS_OPTIONS}
        error={fieldErrors.status}
      />
      <InputField
        id="or-date"
        label="Date"
        type="date"
        value={date}
        onChange={setDate}
        error={fieldErrors.date}
      />
    </FormShell>
  );
}
