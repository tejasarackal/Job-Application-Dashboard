// /api/profile — self-service profile read/write (PRD-multi-user §5.3, §7.4,
// §7.5, D9, D12). Gate: session (requireUserApi) — allowed pre-onboarding;
// the wizard's single submit lands here.
//
// Security shape (D12): STRICT zod allowlist — the body can never carry
// email, accountStatus, a record id, or any owner field; the row is addressed
// by the session email only. Mutations additionally pass assertSameOrigin +
// assertWritable (view-as sessions are read-only by construction, D7).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireUserApi,
  getViewContext,
  assertWritable,
  assertSameOrigin,
  handleAuthError,
  AuthError,
} from "@/lib/session";
import { getUserRow, createUserRow, updateUserRow, type UserRowPatch } from "@/lib/users";
import {
  prefsOrNeutral,
  tejasDefaults,
  serializePrefs,
  type UserPrefs,
} from "@/lib/prefs";
import { isOwner } from "@/lib/auth-shared";

export const dynamic = "force-dynamic";

// ── Schema (STRICT allowlist — PRD §7.4 lengths) ─────────────────────────────

const patchSchema = z.strictObject({
  name: z.string().trim().min(1, "Display name is required.").max(80, "Keep your name under 80 characters."),
  // Optional; empty string clears it (falls back to the Google email).
  outreachEmail: z.union([z.literal(""), z.string().trim().max(254).pipe(z.email("Enter a valid email address."))]),
  titleKeywords: z
    .array(z.string().trim().min(2, "Keywords need at least 2 characters.").max(60, "Keep keywords under 60 characters."))
    .min(1, "Add at least one title keyword.")
    .max(10, "Up to 10 keywords."),
  locations: z
    .array(z.string().trim().min(2, "Locations need at least 2 characters.").max(60, "Keep locations under 60 characters."))
    .max(20, "Up to 20 locations."),
  remotePref: z.enum(["remote_only", "onsite_ok", "no_preference"]),
  voice: z.string().max(20_000, "Keep voice rules under 20,000 characters."),
  about: z.string().max(20_000, "Keep the about section under 20,000 characters."),
  defaultTargets: z.enum(["h1b_all", "none"]),
  completeOnboarding: z.boolean(),
}).partial();

type ProfilePatch = z.infer<typeof patchSchema>;

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!out[field]) out[field] = issue.message;
  }
  return out;
}

function unprocessable(fieldErrors: Record<string, string>): NextResponse {
  return NextResponse.json({ ok: false, fieldErrors }, { status: 422 });
}

// Owner-aware prefs resolution — mirrors lib/prefs#getUserPrefs against a
// FRESH row (the cached lookup there can lag a just-saved PATCH by 30s).
// Members never fall back to the owner's seed (PRD §6.2).
function resolvePrefs(email: string, raw: string | null | undefined): UserPrefs {
  if (isOwner(email) && (raw == null || raw.trim() === "")) return tejasDefaults();
  return prefsOrNeutral(raw);
}

// ── GET — own profile ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const session = await requireUserApi();
    const row = await getUserRow(session.email);
    const prefs = resolvePrefs(session.email, row?.preferences);
    // Owner with no Users row yet (pre-migrate): name falls back to the owner
    // constant so the UI never renders an anonymous admin.
    const name = row?.name ?? (isOwner(session.email) ? "Tejas Arackal" : "");
    return NextResponse.json({
      ok: true,
      profile: {
        email: session.email,
        name,
        onboardingStatus: row?.onboardingStatus ?? (isOwner(session.email) ? "complete" : "pending"),
        defaultTargets: row?.defaultTargets === "none" ? "none" : "h1b_all",
        prefs,
      },
    });
  } catch (e) {
    if (e instanceof AuthError) return handleAuthError(e);
    console.error("profile GET failed", e);
    return NextResponse.json({ ok: false, error: "profile read failed" }, { status: 500 });
  }
}

// ── PATCH — merge-and-save (single writer for self-service profile fields) ──

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireUserApi();
    assertSameOrigin(req);
    assertWritable(await getViewContext());

    const json = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) return unprocessable(zodFieldErrors(parsed.error));
    const body: ProfilePatch = parsed.data;

    // Fresh row read → current prefs → apply provided fields (server merge).
    const row = await getUserRow(session.email);
    const prefs = resolvePrefs(session.email, row?.preferences);

    const prefsTouched =
      body.outreachEmail !== undefined ||
      body.titleKeywords !== undefined ||
      body.locations !== undefined ||
      body.remotePref !== undefined ||
      body.voice !== undefined ||
      body.about !== undefined;

    if (body.outreachEmail !== undefined) {
      if (body.outreachEmail) prefs.identity.outreachEmail = body.outreachEmail;
      else delete prefs.identity.outreachEmail;
    }
    if (body.titleKeywords !== undefined) prefs.jobPrefs.titleKeywords = body.titleKeywords;
    if (body.locations !== undefined) prefs.jobPrefs.locations = body.locations.filter(Boolean);
    if (body.remotePref !== undefined) prefs.jobPrefs.remotePref = body.remotePref;
    if (body.voice !== undefined) {
      if (body.voice.trim()) prefs.voice = body.voice;
      else delete prefs.voice;
    }
    if (body.about !== undefined) {
      if (body.about.trim()) prefs.about = body.about;
      else delete prefs.about;
    }

    const mergedName = (body.name ?? row?.name ?? "").trim();

    // Onboarding completes only when the MERGED result satisfies D9's
    // required fields — never on the raw request alone.
    let onboardingStatus: "complete" | undefined;
    if (body.completeOnboarding === true) {
      const fieldErrors: Record<string, string> = {};
      if (!mergedName) fieldErrors.name = "Display name is required.";
      if (prefs.jobPrefs.titleKeywords.length < 1) {
        fieldErrors.titleKeywords = "Add at least one title keyword.";
      }
      if (Object.keys(fieldErrors).length > 0) return unprocessable(fieldErrors);
      onboardingStatus = "complete";
    }

    let preferencesJson: string;
    try {
      preferencesJson = serializePrefs(prefs); // 90k guard (PRD §6.1)
    } catch {
      return unprocessable({ about: "Preferences are too large — shorten voice or about." });
    }

    if (!row) {
      // Member mid-onboarding (row creation at signIn failed silently) or the
      // owner pre-migrate. The session passed requireUserApi — they were
      // admitted — so "active" here can never resurrect a disabled row: a
      // disabled row EXISTS and routes to updateUserRow below, and a disabled
      // member never reaches this line (requireUserApi fails closed).
      await createUserRow({
        email: session.email,
        name: mergedName || undefined,
        accountStatus: "active",
        onboardingStatus: onboardingStatus ?? "pending",
        defaultTargets: body.defaultTargets,
        preferences: preferencesJson,
      });
    } else {
      const patch: UserRowPatch = {};
      if (body.name !== undefined) patch.name = body.name.trim();
      if (body.defaultTargets !== undefined) patch.defaultTargets = body.defaultTargets;
      if (prefsTouched || onboardingStatus) patch.preferences = preferencesJson;
      if (onboardingStatus) patch.onboardingStatus = onboardingStatus;
      if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true, noop: true });
      await updateUserRow(session.email, patch);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return handleAuthError(e);
    console.error("profile PATCH failed", e);
    return NextResponse.json({ ok: false, error: "profile save failed" }, { status: 500 });
  }
}
