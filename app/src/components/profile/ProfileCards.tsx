"use client";

// /profile editable cards (PRD §7.5 cards 1–3 + the Account sign-out island).
// Each card is view-mode by default with an Edit toggle; Save PATCHes
// /api/profile with ONLY that card's fields (server merges into current
// prefs). Under view-as the page renders these with editable={false} — no
// Edit buttons anywhere (mutations are 403'd server-side regardless, D7).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  ChipInput,
  FieldError,
  PillSelect,
  REMOTE_PREF_OPTIONS,
  TextField,
  remotePrefLabel,
} from "@/components/profile/fields";

type RemotePref = "remote_only" | "onsite_ok" | "no_preference";

const SAVE_FAILED = "Couldn't save. Your changes are still on this page — try again.";

// PRD §7.1 initials: first letter of first + last word; single word → first
// two letters; no name → first two chars of the email local part; max 2, upper.
export function initialsFor(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return email.split("@")[0].slice(0, 2).toUpperCase();
}

async function patchProfile(body: Record<string, unknown>): Promise<{
  ok: boolean;
  fieldErrors?: Record<string, string>;
}> {
  try {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as
      | { ok: boolean; fieldErrors?: Record<string, string> }
      | null;
    return j ?? { ok: false };
  } catch {
    return { ok: false };
  }
}

// Shared per-card edit scaffolding.
function useCardSave() {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setErrors({});
    const j = await patchProfile(body);
    setBusy(false);
    if (j.ok) {
      setEditing(false);
      setMsg("Saved.");
      router.refresh();
      return;
    }
    if (j.fieldErrors) setErrors(j.fieldErrors);
    else setErrors({ form: SAVE_FAILED });
  }

  function startEdit() {
    setEditing(true);
    setMsg("");
    setErrors({});
  }

  return { editing, setEditing, busy, msg, errors, save, startEdit };
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-brand-border text-brand-body hover:bg-brand-canvas"
    >
      Edit
    </button>
  );
}

function SaveCancel({
  busy,
  onSave,
  onCancel,
}: {
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <button
        type="button"
        onClick={onSave}
        disabled={busy}
        className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-brand-ink text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-brand-border text-brand-body hover:bg-brand-canvas disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}

function ViewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-6 py-1.5">
      <span className="w-36 shrink-0 text-[12px] text-brand-muted pt-0.5">{label}</span>
      <div className="text-[13px] text-brand-body min-w-0">{value}</div>
    </div>
  );
}

function SavedNote({ msg }: { msg: string }) {
  if (!msg) return null;
  return <span className="text-[11px] text-brand-muted">{msg}</span>;
}

// ── 1. Identity ──────────────────────────────────────────────────────────────

export function IdentityCard({
  name,
  email,
  outreachEmail,
  editable,
}: {
  name: string;
  email: string;
  outreachEmail: string;
  editable: boolean;
}) {
  const card = useCardSave();
  const [draftName, setDraftName] = useState(name);
  const [draftOutreach, setDraftOutreach] = useState(outreachEmail);

  return (
    <Card>
      <CardHeader
        title="Identity"
        subtitle="Your display name and outreach address"
        right={
          editable && !card.editing ? (
            <span className="flex items-center gap-2">
              <SavedNote msg={card.msg} />
              <EditButton
                onClick={() => {
                  setDraftName(name);
                  setDraftOutreach(outreachEmail);
                  card.startEdit();
                }}
              />
            </span>
          ) : undefined
        }
      />
      <CardBody>
        {card.editing ? (
          <div className="space-y-4 max-w-[420px]">
            <TextField
              id="pf-name"
              label="Display name"
              required
              value={draftName}
              onChange={setDraftName}
              maxLength={80}
              error={card.errors.name}
            />
            <TextField
              id="pf-outreach-email"
              label="Outreach email"
              type="email"
              value={draftOutreach}
              onChange={setDraftOutreach}
              helper="Where you send outreach from — defaults to your Google email."
              error={card.errors.outreachEmail}
            />
            <FieldError error={card.errors.form} />
            <SaveCancel
              busy={card.busy}
              onSave={() => card.save({ name: draftName.trim(), outreachEmail: draftOutreach.trim() })}
              onCancel={() => card.setEditing(false)}
            />
          </div>
        ) : (
          <div className="flex items-start gap-4">
            <div
              title={name || undefined}
              className="w-8 h-8 rounded-full bg-brand-ink text-white flex items-center justify-center text-[12px] font-semibold shrink-0"
            >
              {initialsFor(name, email)}
            </div>
            <div className="min-w-0 flex-1">
              <ViewRow label="Display name" value={name || "—"} />
              <ViewRow label="Outreach email" value={outreachEmail || email} />
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── 2. Job preferences ───────────────────────────────────────────────────────

export function JobPrefsCard({
  titleKeywords,
  locations,
  remotePref,
  editable,
}: {
  titleKeywords: string[];
  locations: string[];
  remotePref: RemotePref;
  editable: boolean;
}) {
  const card = useCardSave();
  const [draftKeywords, setDraftKeywords] = useState(titleKeywords);
  const [draftLocations, setDraftLocations] = useState(locations);
  const [draftRemote, setDraftRemote] = useState<RemotePref>(remotePref);

  const chipList = (items: string[], empty: string) =>
    items.length > 0 ? (
      <span className="flex flex-wrap gap-1.5">
        {items.map((c) => (
          <span
            key={c}
            className="inline-flex text-[12px] px-2 py-0.5 rounded-full bg-brand-canvas border border-brand-border text-brand-body"
          >
            {c}
          </span>
        ))}
      </span>
    ) : (
      <span className="text-brand-muted">{empty}</span>
    );

  return (
    <Card>
      <CardHeader
        title="Job preferences"
        subtitle="Listings you add are scored against these"
        right={
          editable && !card.editing ? (
            <span className="flex items-center gap-2">
              <SavedNote msg={card.msg} />
              <EditButton
                onClick={() => {
                  setDraftKeywords(titleKeywords);
                  setDraftLocations(locations);
                  setDraftRemote(remotePref);
                  card.startEdit();
                }}
              />
            </span>
          ) : undefined
        }
      />
      <CardBody>
        {card.editing ? (
          <div className="space-y-4 max-w-[520px]">
            <ChipInput
              id="pf-keywords"
              label="Title keywords"
              required
              chips={draftKeywords}
              onChange={setDraftKeywords}
              placeholder="e.g. data engineer — press Enter to add"
              error={card.errors.titleKeywords}
            />
            <ChipInput
              id="pf-locations"
              label="Locations"
              chips={draftLocations}
              onChange={setDraftLocations}
              placeholder="e.g. San Francisco — press Enter to add"
              helper="Optional. Leave empty to score listings location-neutrally."
              error={card.errors.locations}
            />
            <PillSelect
              label="Remote preference"
              options={REMOTE_PREF_OPTIONS}
              value={draftRemote}
              onChange={setDraftRemote}
              error={card.errors.remotePref}
            />
            <FieldError error={card.errors.form} />
            <SaveCancel
              busy={card.busy}
              onSave={() =>
                card.save({
                  titleKeywords: draftKeywords,
                  locations: draftLocations,
                  remotePref: draftRemote,
                })
              }
              onCancel={() => card.setEditing(false)}
            />
          </div>
        ) : (
          <div>
            <ViewRow
              label="Title keywords"
              value={chipList(titleKeywords, "None yet — listings score 0 on title until you add one.")}
            />
            <ViewRow label="Locations" value={chipList(locations, "Anywhere")} />
            <ViewRow label="Remote preference" value={remotePrefLabel(remotePref)} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── 3. Voice & about (C2) ────────────────────────────────────────────────────

export function VoiceAboutCard({
  voice,
  about,
  editable,
}: {
  voice: string;
  about: string;
  editable: boolean;
}) {
  const card = useCardSave();
  const [draftVoice, setDraftVoice] = useState(voice);
  const [draftAbout, setDraftAbout] = useState(about);

  const preview = (v: string, empty: string) =>
    v.trim() ? (
      <p className="whitespace-pre-wrap text-[13px] text-brand-body line-clamp-4">{v}</p>
    ) : (
      <span className="text-brand-muted">{empty}</span>
    );

  return (
    <Card>
      <CardHeader
        title="Voice & about"
        subtitle="Used when outreach drafting runs for your account — automation is currently admin-run."
        right={
          editable && !card.editing ? (
            <span className="flex items-center gap-2">
              <SavedNote msg={card.msg} />
              <EditButton
                onClick={() => {
                  setDraftVoice(voice);
                  setDraftAbout(about);
                  card.startEdit();
                }}
              />
            </span>
          ) : undefined
        }
      />
      <CardBody>
        {card.editing ? (
          <div className="space-y-4">
            <div>
              <label htmlFor="pf-voice" className="block text-[12px] font-medium text-brand-heading">
                Voice
              </label>
              <textarea
                id="pf-voice"
                value={draftVoice}
                onChange={(e) => setDraftVoice(e.target.value)}
                rows={6}
                className="mt-1.5 w-full text-[13px] px-3 py-2 rounded-md border border-brand-border bg-white leading-relaxed"
                placeholder="How your outreach should sound — tone, structure, rules."
              />
              <FieldError error={card.errors.voice} />
            </div>
            <div>
              <label htmlFor="pf-about" className="block text-[12px] font-medium text-brand-heading">
                About
              </label>
              <textarea
                id="pf-about"
                value={draftAbout}
                onChange={(e) => setDraftAbout(e.target.value)}
                rows={6}
                className="mt-1.5 w-full text-[13px] px-3 py-2 rounded-md border border-brand-border bg-white leading-relaxed"
                placeholder="Your background — what a drafted email can truthfully say about you."
              />
              <FieldError error={card.errors.about} />
            </div>
            <FieldError error={card.errors.form} />
            <SaveCancel
              busy={card.busy}
              onSave={() => card.save({ voice: draftVoice, about: draftAbout })}
              onCancel={() => card.setEditing(false)}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <ViewRow label="Voice" value={preview(voice, "Not set.")} />
            <ViewRow label="About" value={preview(about, "Not set.")} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── 5. Account — sign-out island ─────────────────────────────────────────────

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut({ redirectTo: "/login" });
      }}
      className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-brand-border text-brand-body hover:bg-brand-canvas disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
