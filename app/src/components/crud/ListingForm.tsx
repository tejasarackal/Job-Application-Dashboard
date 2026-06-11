"use client";

// Add-listing form island (PRD-multi-user §7.7). POSTs /api/listings; the
// route computes the match % on save against the caller's own preferences.

import { useState } from "react";
import { InputField, CheckboxField } from "./fields";
import { FormShell, useCreateForm } from "./CreateForm";

export function ListingForm({
  initialCompany = "",
  readOnly,
}: {
  initialCompany?: string;
  readOnly: boolean;
}) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState(initialCompany);
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState(false);
  const [postedAt, setPostedAt] = useState("");
  const { busy, formError, fieldErrors, submit } = useCreateForm("/api/listings", "/listings");

  return (
    <FormShell
      onSubmit={() => submit({ title, company, url, location, remote, postedAt })}
      busy={busy}
      formError={formError}
      readOnly={readOnly}
      submitLabel="Add listing"
    >
      <InputField
        id="listing-title"
        label="Title"
        required
        value={title}
        onChange={setTitle}
        maxLength={120}
        placeholder="Senior Data Engineer"
        error={fieldErrors.title}
      />
      <InputField
        id="listing-company"
        label="Company"
        required
        value={company}
        onChange={setCompany}
        maxLength={80}
        error={fieldErrors.company}
      />
      <InputField
        id="listing-url"
        label="Posting URL"
        type="url"
        value={url}
        onChange={setUrl}
        placeholder="https://…"
        helper="The board (Greenhouse, Lever, Workday…) is detected from the URL."
        error={fieldErrors.url}
      />
      <InputField
        id="listing-location"
        label="Location"
        value={location}
        onChange={setLocation}
        maxLength={120}
        placeholder="San Francisco, CA"
        error={fieldErrors.location}
      />
      <CheckboxField id="listing-remote" label="Remote role" checked={remote} onChange={setRemote} />
      <InputField
        id="listing-posted"
        label="Posted on"
        type="date"
        value={postedAt}
        onChange={setPostedAt}
        helper="Scored against your preferences when the listing is saved."
        error={fieldErrors.postedAt}
      />
    </FormShell>
  );
}
