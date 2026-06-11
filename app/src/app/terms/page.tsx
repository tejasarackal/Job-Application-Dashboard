export const metadata = { title: "Terms of use" };

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

export default function TermsPage() {
  return (
    <main className="flex-1 px-6 py-10">
      <div className="max-w-[720px] mx-auto bg-white border border-brand-border rounded-card shadow-card px-8 py-8">
        <h1 className="text-[20px] font-semibold text-brand-heading">Terms of use</h1>
        <p className="mt-1 text-[12px] text-brand-muted">
          Job Application Dashboard · Effective date: June 10, 2026
        </p>

        <Section title="Acceptance">
          <p>
            By signing in to Job Application Dashboard you agree to these terms. If you do not
            agree, do not use the service.
          </p>
        </Section>

        <Section title="Permitted use">
          <p>
            The service is for personal, non-commercial use: tracking your own job search. Do not
            resell access, scrape the service, or use it on behalf of an organization.
          </p>
        </Section>

        <Section title="No warranty">
          <p>
            The service is provided as-is, without warranty of any kind. Data shown may be
            incomplete, delayed, or inaccurate.
          </p>
        </Section>

        <Section title="No outcome guarantees">
          <p>
            The service does not guarantee job-search outcomes or visa sponsorship. H1B sponsor
            information derives from public US Department of Labor LCA disclosure data; past
            sponsorship is not a guarantee of sponsorship.
          </p>
        </Section>

        <Section title="Your data and responsibilities">
          <p>
            You are responsible for the accuracy of the data you enter. How your data is handled is
            described in the privacy policy.
          </p>
        </Section>

        <Section title="Account suspension">
          <p>
            The operator may disable accounts that abuse the service, including attempts to access
            other users&apos; data or to disrupt operation.
          </p>
        </Section>

        <Section title="Changes to the service">
          <p>
            The service may change or be discontinued at any time. Where practical, you will have
            the chance to request your data before discontinuation (see the privacy policy).
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            If these terms change, the effective date above is updated. Continued use after a
            change means you accept the updated terms.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these terms:{" "}
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
