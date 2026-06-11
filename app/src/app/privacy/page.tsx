export const metadata = { title: "Privacy policy" };

const CONTACT = "tejasarackal90@gmail.com";

// Public legal page (PRD-multi-user §5.3) — server component, no client JS.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-[14px] font-semibold text-brand-heading">{title}</h2>
      <div className="mt-1.5 text-[13px] leading-relaxed text-brand-body space-y-2">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="flex-1 px-6 py-10">
      <div className="max-w-[720px] mx-auto bg-white border border-brand-border rounded-card shadow-card px-8 py-8">
        <h1 className="text-[20px] font-semibold text-brand-heading">Privacy policy</h1>
        <p className="mt-1 text-[12px] text-brand-muted">
          Job Application Dashboard · Effective date: June 10, 2026
        </p>

        <Section title="What this covers">
          <p>
            This policy describes what data Job Application Dashboard collects, where it is stored,
            who can access it, and how to have it deleted.
          </p>
        </Section>

        <Section title="What you share when you sign in">
          <p>
            You sign in with Google OAuth. Signing in shares your Google name, email address, and
            profile photo with this app. The app requests no other Google account data.
          </p>
        </Section>

        <Section title="What the app stores">
          <p>
            The app stores your profile, your job preferences, your target-company selections, and
            the job-search records you choose to track: listings, applications, interviews, and
            outreach. It stores nothing you do not enter or explicitly track.
          </p>
        </Section>

        <Section title="Where your data lives">
          <p>
            Your data is stored in Airtable on the operator&apos;s account. The app runs on Vercel.
          </p>
        </Section>

        <Section title="Data isolation">
          <p>
            Strict per-user isolation is enforced in application code. Every read and write is
            scoped to your account; other users cannot see your records.
          </p>
        </Section>

        <Section title="Administrator access">
          <p>
            Administrators can access user data for support and debugging. Each such access is
            logged.
          </p>
        </Section>

        <Section title="Email">
          <p>
            The app never sends email on your behalf. Where the app prepares outreach, the output
            is a draft that only you can send.
          </p>
        </Section>

        <Section title="Third parties">
          <p>
            Your data is not sold. It is not shared with any third party beyond the processors the
            app is built on: Google (sign-in), Airtable (storage), and Vercel (hosting).
          </p>
        </Section>

        <Section title="H1B sponsor data">
          <p>
            The H1B sponsor list derives from public US Department of Labor LCA disclosure data.
            Past sponsorship is not a guarantee of sponsorship.
          </p>
        </Section>

        <Section title="Deleting your account and data">
          <p>
            To delete your account and all associated data, email{" "}
            <a href={`mailto:${CONTACT}`} className="text-brand-ink underline">
              {CONTACT}
            </a>
            . Deletion covers your profile, preferences, target selections, and tracked records.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If this policy changes, the effective date above is updated. Continued use after a
            change means you accept the updated policy.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy:{" "}
            <a href={`mailto:${CONTACT}`} className="text-brand-ink underline">
              {CONTACT}
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}
