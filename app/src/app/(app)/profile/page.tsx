// /profile — five cards over the caller's own Users row (PRD §7.5).
// Gate (PRD §5.3): session — allowed pre-onboarding, so this page deliberately
// does NOT use requireUser() (which bounces not-onboarded sessions to
// /onboarding); auth() + getViewContext() is the gate, and PATCH /api/profile
// (requireUserApi) remains the security control for every write.
//
// Under view-as: all cards render view-mode only (no Edit buttons) and the
// Account card is hidden — the admin must never see a sign-out affordance for
// someone else's session.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getViewContext } from "@/lib/session";
import { getUserRow } from "@/lib/users";
import { prefsOrNeutral, tejasDefaults, type UserPrefs } from "@/lib/prefs";
import { isOwner } from "@/lib/auth-shared";
import { listTargets, listUserTargets } from "@/lib/airtable";
import { effectiveTargets, type MasterCompany, type TargetDeviation } from "@/lib/targets";
import { normalizeCompany } from "@/lib/workflows/filters";
import { Header } from "@/components/layout/Header";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  IdentityCard,
  JobPrefsCard,
  VoiceAboutCard,
  SignOutButton,
} from "@/components/profile/ProfileCards";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

// Owner-aware prefs (mirrors lib/prefs#getUserPrefs against the fresh row).
function resolvePrefs(email: string, raw: string | null | undefined): UserPrefs {
  if (isOwner(email) && (raw == null || raw.trim() === "")) return tejasDefaults();
  return prefsOrNeutral(raw);
}

async function targetsSummary(
  email: string,
  mode: "h1b_all" | "none",
): Promise<string | null> {
  try {
    const [targets, deviationRows] = await Promise.all([
      listTargets(),
      listUserTargets(email),
    ]);
    const master: MasterCompany[] = targets.map((t) => ({
      key: normalizeCompany(t.employer),
      name: t.employer,
      careersUrl: t.careersUrl,
    }));
    const deviations: TargetDeviation[] = deviationRows
      .filter((d) => d.status === "excluded" || d.status === "added")
      .map((d) => ({
        id: d.id,
        companyKey: d.companyKey,
        status: d.status as "excluded" | "added",
        companyName: d.companyName,
        careersUrl: d.careersUrl,
        h1bVerified: d.h1bVerified,
      }));
    const { counts } = effectiveTargets(master, mode, deviations);
    if (mode === "none") return `Targeting ${counts.added} companies`;
    return `Targeting ${counts.effective - counts.added} of ${counts.master} sponsors · ${counts.added} custom`;
  } catch {
    return null; // Airtable unreachable — render a factual fallback below
  }
}

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  const ctx = await getViewContext();

  const email = ctx.effectiveEmail;
  const row = await getUserRow(email);
  const prefs = resolvePrefs(email, row?.preferences);
  const name = row?.name ?? (isOwner(email) ? "Tejas Arackal" : session.user?.name ?? "");
  const mode: "h1b_all" | "none" = row?.defaultTargets === "none" ? "none" : "h1b_all";
  const summary = await targetsSummary(email, mode);

  const editable = !ctx.isViewAs;

  return (
    <>
      <Header title="Profile" subtitle="Your account, preferences, and search criteria" />
      <main className="p-8">
        <div className="max-w-[860px] space-y-6">
          <IdentityCard
            name={name}
            email={email}
            outreachEmail={prefs.identity.outreachEmail ?? ""}
            editable={editable}
          />

          <JobPrefsCard
            titleKeywords={prefs.jobPrefs.titleKeywords}
            locations={prefs.jobPrefs.locations}
            remotePref={prefs.jobPrefs.remotePref}
            editable={editable}
          />

          <VoiceAboutCard voice={prefs.voice ?? ""} about={prefs.about ?? ""} editable={editable} />

          <Card>
            <CardHeader title="Target companies" subtitle="Companies in scope for your search" />
            <CardBody>
              <p className="text-[13px] text-brand-body">
                {summary ?? "Target summary is unavailable right now — your list is unchanged."}
              </p>
              <Link
                href="/targets"
                className="inline-block mt-2 text-[13px] font-medium text-brand-ink hover:underline"
              >
                Manage target companies →
              </Link>
            </CardBody>
          </Card>

          {!ctx.isViewAs && (
            <Card>
              <CardHeader title="Account" subtitle="Sign-in and account controls" />
              <CardBody>
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="text-[13px] text-brand-body">{email}</p>
                    <p className="text-[11px] text-brand-muted mt-0.5">From your Google account.</p>
                  </div>
                  <SignOutButton />
                </div>
                <p className="text-[11px] text-brand-muted mt-4">
                  To delete your account, contact the administrator.
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
