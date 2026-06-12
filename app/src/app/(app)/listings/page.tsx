import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Stat } from "@/components/ui/Stat";
import { ListingsTable } from "./ListingsTable";
import { JobTrigger } from "@/components/workflows/JobTrigger";
import { getListings } from "@/lib/fetcher";
import { getViewContext } from "@/lib/session";
import type { JobListing } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Job Listings" };

// One section per status, rendered in pipeline order. Any status not listed here
// (e.g. a new option added in Airtable) is appended after these so a row is
// never silently dropped from the page.
const SECTIONS: { status: string; title: string; hint: string }[] = [
  { status: "new", title: "New", hint: "Awaiting triage" },
  { status: "queued", title: "Queued", hint: "Ready for review" },
  { status: "approved", title: "Approved", hint: "Cleared to apply" },
  { status: "review_pending", title: "Review Pending", hint: "In review" },
  { status: "applied", title: "Applied", hint: "Submitted" },
  { status: "skipped", title: "Skipped", hint: "Filtered out" },
  { status: "expired", title: "Expired", hint: "Posting closed / superseded" },
];

const titleCase = (s: string) =>
  s.replace(/(^|[_\s])(\w)/g, (_, sep, ch) => (sep ? " " : "") + ch.toUpperCase()).trim();

export default async function ListingsPage({
  searchParams,
}: {
  searchParams?: { welcome?: string };
}) {
  const ctx = await getViewContext();
  const { data, source } = await getListings(ctx.effectiveEmail);
  // Post-onboarding first landing: kick off the user's first scrape once.
  const welcome = searchParams?.welcome != null && data.length === 0 && !ctx.isViewAs;

  // Group by status (lower-cased so "New"/"new" land together).
  const groups = new Map<string, JobListing[]>();
  for (const l of data) {
    const k = (l.status ?? "unknown").toLowerCase();
    const arr = groups.get(k);
    if (arr) arr.push(l);
    else groups.set(k, [l]);
  }

  // Known statuses in pipeline order, then any leftover statuses appended.
  const ordered = [
    ...SECTIONS.filter((s) => groups.has(s.status)),
    ...[...groups.keys()]
      .filter((k) => !SECTIONS.some((s) => s.status === k))
      .map((k) => ({ status: k, title: titleCase(k), hint: "" })),
  ];

  const count = (s: string) => groups.get(s)?.length ?? 0;

  return (
    <>
      <Header
        title="Job Listings"
        subtitle="Roles from your target companies, matched to your preferences"
      />
      <main className="p-8 space-y-6">
        {!ctx.isViewAs && (
          <div className="flex justify-end items-start gap-3">
            <JobTrigger
              workflow="scrape_jobs"
              idleLabel="Find jobs"
              busyLabel="Finding jobs…"
              autoStart={welcome}
            />
            <Link
              href="/listings/new"
              className="bg-white border border-brand-border text-brand-body text-[12px] font-medium px-3 py-1.5 rounded-md hover:bg-brand-canvas"
            >
              Add listing
            </Link>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <Card><div className="p-6"><Stat label="New" value={count("new")} hint="Awaiting triage" /></div></Card>
          <Card><div className="p-6"><Stat label="Queued" value={count("queued")} hint="Ready for review" /></div></Card>
          <Card><div className="p-6"><Stat label="Approved" value={count("approved")} hint="Cleared to apply" /></div></Card>
          <Card><div className="p-6"><Stat label="Applied" value={count("applied")} hint="Submitted" /></div></Card>
        </div>

        {ordered.length === 0 ? (
          <Card>
            <CardHeader
              title={welcome ? "Finding your first jobs…" : "All listings"}
              subtitle={welcome ? "Scraping your target companies — this takes up to a minute" : "0 postings"}
              right={<SourceBadge source={source} />}
            />
            <CardBody padded={false}>
              <ListingsTable
                rows={[]}
                empty={
                  ctx.isViewAs
                    ? "No job listings yet."
                    : "No job listings yet. Click Find jobs to scrape your target companies, or add a role manually."
                }
              />
            </CardBody>
          </Card>
        ) : (
          ordered.map((section, i) => {
            const rows = groups.get(section.status) ?? [];
            const h1b = rows.filter((l) => l.h1bVerified).length;
            const subtitle = [section.hint, `${rows.length} ${rows.length === 1 ? "posting" : "postings"}`, `${h1b} H1B-verified`]
              .filter(Boolean)
              .join(" · ");
            return (
              <Card key={section.status}>
                <CardHeader
                  title={`${section.title} · ${rows.length}`}
                  subtitle={subtitle}
                  // Show the live/mock indicator once, on the first section.
                  right={i === 0 ? <SourceBadge source={source} /> : undefined}
                />
                <CardBody padded={false}>
                  <ListingsTable rows={rows} />
                </CardBody>
              </Card>
            );
          })
        )}
      </main>
    </>
  );
}
