import { Header } from "@/components/layout/Header";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Stat } from "@/components/ui/Stat";
import { getListings } from "@/lib/fetcher";
import { formatRelative } from "@/lib/utils";
import type { JobListing } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ListingsPage() {
  const { data, source } = await getListings();

  const byStatus = data.reduce<Record<string, number>>((acc, l) => {
    const k = l.status ?? "unknown";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const newCount = byStatus["new"] ?? 0;
  const queued = byStatus["queued"] ?? 0;
  const approved = byStatus["approved"] ?? 0;
  const applied = byStatus["applied"] ?? 0;

  return (
    <>
      <Header
        title="Job Listings"
        subtitle="Apify-scraped postings from Greenhouse, Lever, LinkedIn, Workday"
      />
      <main className="p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <Card><div className="p-6"><Stat label="New" value={newCount} hint="Awaiting triage" /></div></Card>
          <Card><div className="p-6"><Stat label="Queued" value={queued} hint="Ready for review" /></div></Card>
          <Card><div className="p-6"><Stat label="Approved" value={approved} hint="Cleared to apply" /></div></Card>
          <Card><div className="p-6"><Stat label="Applied" value={applied} hint="Submitted" /></div></Card>
        </div>

        <Card>
          <CardHeader
            title="All listings"
            subtitle={`${data.length} postings · ${data.filter((l) => l.h1bVerified).length} H1B-verified`}
            right={<SourceBadge source={source} />}
          />
          <CardBody padded={false}>
            <DataTable<JobListing>
              rowKey={(r) => r.id}
              rows={data}
              columns={[
                {
                  key: "title",
                  header: "Role",
                  render: (r) => (
                    <div>
                      <p className="font-medium text-brand-heading">{r.title}</p>
                      <p className="text-[11px] text-brand-muted">{r.company}</p>
                    </div>
                  ),
                },
                { key: "board", header: "Board", render: (r) => <StatusBadge label={r.board} /> },
                {
                  key: "loc",
                  header: "Location",
                  render: (r) => (
                    <span className="text-brand-body">
                      {r.location ?? "—"}
                      {r.remote && (
                        <span className="ml-2 text-[10.5px] uppercase tracking-wider text-status-teal-fg font-semibold">
                          Remote
                        </span>
                      )}
                    </span>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (r) => <StatusBadge label={r.status} />,
                },
                {
                  key: "scraped",
                  header: "Scraped",
                  render: (r) => <span className="text-brand-muted text-[12px]">{formatRelative(r.scrapedAt)}</span>,
                },
                {
                  key: "link",
                  header: "",
                  align: "right",
                  render: (r) =>
                    r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-ink hover:text-brand-inkHover text-[12px] font-medium"
                      >
                        Open ↗
                      </a>
                    ) : null,
                },
              ]}
              empty="No listings have been scraped yet. Configure an Apify actor to populate this table."
            />
          </CardBody>
        </Card>
      </main>
    </>
  );
}
