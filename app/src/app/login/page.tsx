// /login — the only public product surface (PRD §7.2). Server component;
// the only client island is the Google button. TopNav suppresses itself on
// this route (M0 guard) so the card owns the full viewport.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { validateCallbackUrl } from "@/lib/auth-shared";
import { GoogleSignInButton } from "./GoogleSignInButton";

export const metadata: Metadata = { title: "Sign in" };

// auth() needs the runtime request — never prerender this page at build time
// (secrets don't resolve during `next build`).
export const dynamic = "force-dynamic";

// Error banner copy (PRD §7.2) — factual, never apologetic.
const ERROR_COPY: Record<string, string> = {
  "signups-disabled": "Sign-ups are currently closed. Existing accounts can still sign in.",
  "user-cap": "This instance has reached its user limit. Existing accounts are unaffected.",
  "pending-approval": "Your account is awaiting approval. Check back soon.",
};
const DEFAULT_ERROR = "Sign-in didn't complete. Nothing was saved — try again.";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { callbackUrl?: string; error?: string };
}) {
  const callbackUrl = validateCallbackUrl(searchParams?.callbackUrl);
  const error = searchParams?.error;

  // Already signed in → straight to the validated destination. Skipped when
  // an error is being shown (e.g. a disabled account still holding a JWT —
  // redirecting would loop through requireUser).
  if (!error) {
    const session = await auth();
    if (session?.user?.email) redirect(callbackUrl);
  }

  return (
    <main className="flex-1 flex items-center justify-center bg-brand-canvas px-4 py-10">
      <div className="w-full max-w-[400px] bg-white border border-brand-border rounded-card shadow-card px-8 py-9">
        {/* JobDash wordmark — exact markup from components/layout/TopNav.tsx */}
        <div className="text-[20px] font-semibold tracking-tight text-brand-heading shrink-0">
          <span className="font-bold">Job</span>
          <span className="font-medium text-brand-ink">Dash</span>
        </div>

        <h1 className="mt-6 text-[22px] font-semibold leading-snug text-brand-heading">
          Your job search, in one place.
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-brand-body">
          Track applications, interviews, outreach, and target companies in a private
          pipeline. Your data is yours alone.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-card border border-status-red-fg/20 bg-status-red-bg px-4 py-3 text-[12px] leading-relaxed text-status-red-fg"
          >
            {ERROR_COPY[error] ?? DEFAULT_ERROR}
          </div>
        )}

        <div className="mt-6">
          <GoogleSignInButton callbackUrl={callbackUrl} />
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-brand-muted">
          Signing in shares your Google name, email address, and profile photo with this
          app. The app stores your profile, your job preferences, and the applications you
          choose to track — and nothing else. It never sends email on your behalf.
        </p>
        <p className="mt-3 text-[11px] leading-relaxed text-brand-muted">
          By continuing, you agree to the{" "}
          <Link href="/terms" className="underline hover:text-brand-heading">
            Terms
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" className="underline hover:text-brand-heading">
            Privacy policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
