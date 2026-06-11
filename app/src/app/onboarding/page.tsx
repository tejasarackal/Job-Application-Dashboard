// /onboarding — 3-step single-submit wizard (PRD §7.4, D9). Lives OUTSIDE the
// (app) route group: no TopNav, and deliberately NOT requireUser() — that
// helper redirects not-onboarded sessions here, which would loop. auth()
// directly is the gate; completed users bounce straight home.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { normalizeEmail } from "@/lib/auth-shared";
import { getUserRow } from "@/lib/users";
import { prefsOrNeutral } from "@/lib/prefs";
import { listTargets } from "@/lib/airtable";
import { COMPANY_REGISTRY } from "@/lib/company-registry";
import { OnboardingWizard } from "./OnboardingWizard";

export const metadata: Metadata = { title: "Set up your workspace" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) redirect("/login");
  const normalized = normalizeEmail(email);

  const row = await getUserRow(normalized);
  if (row?.onboardingStatus === "complete") redirect("/");

  // {N} verified H1B sponsors for step 2 — live master count, registry fallback
  // when Airtable is unreachable (copy must never read "0 sponsors").
  let sponsorCount = Object.keys(COMPANY_REGISTRY).length;
  try {
    const master = await listTargets();
    if (master.length > 0) sponsorCount = master.length;
  } catch {
    // keep the registry fallback
  }

  const prefs = prefsOrNeutral(row?.preferences);

  return (
    <main className="flex-1 bg-brand-canvas px-4 py-10">
      <div className="mx-auto w-full max-w-[640px]">
        {/* JobDash wordmark — exact markup from components/layout/TopNav.tsx */}
        <div className="text-[20px] font-semibold tracking-tight text-brand-heading">
          <span className="font-bold">Job</span>
          <span className="font-medium text-brand-ink">Dash</span>
        </div>

        <OnboardingWizard
          seed={{
            name: row?.name ?? session.user?.name ?? "",
            googleEmail: normalized,
            outreachEmail: prefs.identity.outreachEmail ?? normalized,
            titleKeywords: prefs.jobPrefs.titleKeywords,
            locations: prefs.jobPrefs.locations,
            remotePref: prefs.jobPrefs.remotePref,
            defaultTargets: row?.defaultTargets === "none" ? "none" : "h1b_all",
          }}
          sponsorCount={sponsorCount}
        />
      </div>
    </main>
  );
}
