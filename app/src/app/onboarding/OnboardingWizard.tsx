"use client";

// 3-step single-submit onboarding wizard (PRD §7.4, D9). All state is local;
// the ONE network call is the step-3 Finish setup → PATCH /api/profile with
// completeOnboarding:true. Client validation gates Continue; the server's
// zod allowlist is authoritative (422 fieldErrors jump back to the failing
// step). Copy: sentence case, no exclamation marks (PRD §7.10).

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { classNames } from "@/lib/utils";
import {
  ChipInput,
  FieldError,
  PillSelect,
  REMOTE_PREF_OPTIONS,
  TextField,
  remotePrefLabel,
} from "@/components/profile/fields";

type RemotePref = "remote_only" | "onsite_ok" | "no_preference";
type TargetsMode = "h1b_all" | "none";

export interface WizardSeed {
  name: string;
  googleEmail: string;
  outreachEmail: string;
  titleKeywords: string[];
  locations: string[];
  remotePref: RemotePref;
  defaultTargets: TargetsMode;
}

const STEP_LABELS = ["About you", "Target companies", "Review"] as const;

// Which step owns each server-reported field error (422 jump-back).
const FIELD_STEP: Record<string, number> = {
  name: 1,
  outreachEmail: 1,
  titleKeywords: 1,
  locations: 1,
  remotePref: 1,
  defaultTargets: 2,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function OnboardingWizard({ seed, sponsorCount }: { seed: WizardSeed; sponsorCount: number }) {
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState(seed.name);
  const [outreachEmail, setOutreachEmail] = useState(seed.outreachEmail);
  const [titleKeywords, setTitleKeywords] = useState<string[]>(seed.titleKeywords);
  const [locations, setLocations] = useState<string[]>(seed.locations);
  const [remotePref, setRemotePref] = useState<RemotePref>(seed.remotePref);
  const [defaultTargets, setDefaultTargets] = useState<TargetsMode>(seed.defaultTargets);

  const [errors, setErrors] = useState<Record<string, string>>({});

  function validateStep1(): boolean {
    const e: Record<string, string> = {};
    const n = name.trim();
    if (!n) e.name = "Display name is required.";
    else if (n.length > 80) e.name = "Keep your name under 80 characters.";
    const oe = outreachEmail.trim();
    if (oe && !EMAIL_RE.test(oe)) e.outreachEmail = "Enter a valid email address.";
    if (titleKeywords.length < 1) e.titleKeywords = "Add at least one title keyword.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (step === 1 && !validateStep1()) return;
    setErrors({});
    setStep(step + 1);
  }

  async function finish() {
    setBusy(true);
    setErrors({});
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          outreachEmail: outreachEmail.trim(),
          titleKeywords,
          locations,
          remotePref,
          defaultTargets,
          completeOnboarding: true,
        }),
      });
      const j = (await res.json().catch(() => null)) as
        | { ok: boolean; fieldErrors?: Record<string, string>; error?: string }
        | null;
      if (j?.ok) {
        setDone(true);
        return;
      }
      if (res.status === 422 && j?.fieldErrors) {
        setErrors(j.fieldErrors);
        const firstStep = Math.min(
          ...Object.keys(j.fieldErrors).map((f) => FIELD_STEP[f] ?? 3),
        );
        setStep(firstStep);
        return;
      }
      setErrors({ form: "Couldn't save. Your changes are still on this page — try again." });
    } catch {
      setErrors({ form: "Couldn't save. Your changes are still on this page — try again." });
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card className="mt-8">
        <CardBody className="pt-8 pb-8 text-center">
          <h1 className="text-[22px] font-semibold text-brand-heading">You&rsquo;re set.</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-brand-body">
            Your dashboard starts empty. Add applications as you submit them — tracking is
            manual in this release.
          </p>
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            className="mt-6 text-[13px] font-semibold px-4 py-2 rounded-md bg-brand-ink text-white hover:opacity-90"
          >
            Go to dashboard
          </button>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      <Progress step={step} />

      {step === 1 && (
        <Card>
          <CardHeader
            title="About you"
            subtitle="Your name and how you reach out. This labels your workspace — it isn't shared with anyone."
          />
          <CardBody className="space-y-4">
            <TextField
              id="ob-name"
              label="Display name"
              required
              value={name}
              onChange={setName}
              maxLength={80}
              error={errors.name}
            />
            <TextField
              id="ob-outreach-email"
              label="Outreach email"
              type="email"
              value={outreachEmail}
              onChange={setOutreachEmail}
              helper="Where you send outreach from — defaults to your Google email."
              error={errors.outreachEmail}
            />
            <ChipInput
              id="ob-keywords"
              label="Title keywords"
              required
              chips={titleKeywords}
              onChange={(c) => {
                setTitleKeywords(c);
                if (c.length > 0) setErrors((e) => ({ ...e, titleKeywords: "" }));
              }}
              placeholder="e.g. data engineer — press Enter to add"
              helper="Job titles you're looking for. Listings are scored against these."
              error={errors.titleKeywords}
            />
            <ChipInput
              id="ob-locations"
              label="Locations"
              chips={locations}
              onChange={setLocations}
              placeholder="e.g. San Francisco — press Enter to add"
              helper="Optional. Leave empty to score listings location-neutrally."
              error={errors.locations}
            />
            <PillSelect
              label="Remote preference"
              options={REMOTE_PREF_OPTIONS}
              value={remotePref}
              onChange={setRemotePref}
              error={errors.remotePref}
            />
          </CardBody>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader
            title="Target companies"
            subtitle={`Start from ${sponsorCount} verified H1B sponsors, or start empty and build your own list.`}
          />
          <CardBody className="space-y-4">
            <div className="space-y-2" role="radiogroup" aria-label="Target companies">
              <ModeRadio
                checked={defaultTargets === "h1b_all"}
                onSelect={() => setDefaultTargets("h1b_all")}
                title="Start with the H1B sponsor list"
                helper={`${sponsorCount} verified H1B sponsors. Fine-tune anytime at /targets.`}
              />
              <ModeRadio
                checked={defaultTargets === "none"}
                onSelect={() => setDefaultTargets("none")}
                title="I don't need visa sponsorship — start with an empty list"
                helper="Add companies one by one at /targets."
              />
            </div>
            <FieldError error={errors.defaultTargets} />

            <div className="rounded-md border border-brand-border bg-brand-canvas px-4 py-3">
              <p className="text-[12px] leading-relaxed text-brand-body">
                These companies appear in public US Department of Labor H1B disclosure data,
                meaning each has sponsored H1B workers before. Past sponsorship is not a
                guarantee — confirm sponsorship for each role directly with the employer.
              </p>
              <p className="text-[11px] text-brand-muted mt-2">
                Source: US DOL LCA disclosure data, FY2026.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader title="Review" subtitle="Check your setup, then finish." />
          <CardBody className="space-y-0">
            <ReviewRow label="Display name" value={name.trim() || "—"} />
            <ReviewRow label="Outreach email" value={outreachEmail.trim() || seed.googleEmail} />
            <ReviewRow
              label="Title keywords"
              value={titleKeywords.length > 0 ? titleKeywords.join(" · ") : "—"}
            />
            <ReviewRow
              label="Locations"
              value={locations.length > 0 ? locations.join(" · ") : "Anywhere"}
            />
            <ReviewRow label="Remote preference" value={remotePrefLabel(remotePref)} />
            <ReviewRow
              label="Target companies"
              value={
                defaultTargets === "h1b_all"
                  ? `H1B sponsor list (${sponsorCount} companies)`
                  : "Empty list"
              }
              last
            />
            <FieldError error={errors.form} />
          </CardBody>
        </Card>
      )}

      <div className="flex items-center justify-between">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            disabled={busy}
            className="text-[13px] font-medium px-4 py-2 rounded-md border border-brand-border text-brand-body bg-white hover:bg-brand-canvas disabled:opacity-50"
          >
            Back
          </button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          <button
            type="button"
            onClick={next}
            className="text-[13px] font-semibold px-4 py-2 rounded-md bg-brand-ink text-white hover:opacity-90"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={busy}
            className="text-[13px] font-semibold px-4 py-2 rounded-md bg-brand-ink text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Finish setup"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function Progress({ step }: { step: number }) {
  return (
    <div>
      <p className="text-[12px] text-brand-muted">Step {step} of 3</p>
      <div className="mt-2 flex items-center gap-3">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "active" : "todo";
          return (
            <div key={label} className="flex items-center gap-2">
              <span
                className={classNames(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold border",
                  state === "active" && "bg-brand-ink text-white border-brand-ink",
                  state === "done" && "bg-white text-brand-ink border-brand-ink",
                  state === "todo" && "bg-white text-brand-muted border-brand-border",
                )}
              >
                {n}
              </span>
              <span
                className={classNames(
                  "text-[12px]",
                  state === "active" ? "font-medium text-brand-heading" : "text-brand-muted",
                )}
              >
                {label}
              </span>
              {n < STEP_LABELS.length && <span className="w-6 h-px bg-brand-border" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModeRadio({
  checked,
  onSelect,
  title,
  helper,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  helper: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={classNames(
        "w-full text-left px-4 py-3 rounded-md border transition-colors",
        checked ? "border-brand-ink bg-white" : "border-brand-border bg-white hover:bg-brand-canvas",
      )}
    >
      <span className="flex items-start gap-3">
        <span
          aria-hidden
          className={classNames(
            "mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0",
            checked ? "border-brand-ink" : "border-brand-border",
          )}
        >
          {checked && <span className="w-2 h-2 rounded-full bg-brand-ink" />}
        </span>
        <span>
          <span className="block text-[13px] font-medium text-brand-heading">{title}</span>
          <span className="block text-[12px] text-brand-muted mt-0.5">{helper}</span>
        </span>
      </span>
    </button>
  );
}

function ReviewRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={classNames(
        "flex items-start justify-between gap-6 py-2.5",
        !last && "border-b border-brand-border",
      )}
    >
      <span className="text-[12px] text-brand-muted shrink-0">{label}</span>
      <span className="text-[13px] text-brand-body text-right break-words min-w-0">{value}</span>
    </div>
  );
}
