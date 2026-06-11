import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { BaseTag } from "@/components/ui/BaseTag";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Funnel } from "@/components/ui/Funnel";
import { DataTable } from "@/components/ui/DataTable";

// Tiny "View all →" header link, reused on every Overview preview card.
function ViewAllLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="text-[12px] font-medium text-brand-ink hover:text-brand-inkHover"
    >
      View all →
    </Link>
  );
}
import {
  getApifyRuns,
  getApplications,
  getOutreach,
  getSequences,
  getSummary,
} from "@/lib/fetcher";
import { formatRelative, pct, statusColor } from "@/lib/utils";
import { getViewContext } from "@/lib/session";
import type { ApolloSequence, Application, OutreachContact } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

// Funnel stage → detail page. Each funnel row deep-links to its sub-nav.
const FUNNEL_ROUTES: Record<string, string> = {
  Targets: "/targets",
  Listings: "/listings",
  Outreach: "/outreach",
  Applied: "/applications",
  Interviewing: "/interviews",
  Offered: "/applications",
};

export default async function OverviewPage() {
  // Owned reads are scoped to the viewing identity (PRD §5.2/§7.8).
  const ctx = await getViewContext();
  const [summary, apps, outreach, sequences, runs] = await Promise.all([
    getSummary(ctx.effectiveEmail),
    getApplications(ctx.effectiveEmail),
    getOutreach(ctx.effectiveEmail),
    getSequences(),
    getApifyRuns(),
  ]);

  const s = summary.data;
  const recentApps = [...apps.data]
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
    .slice(0, 5);
  const recentOutreach = [...outreach.data]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 5);

  // Collapse the repeated per-actor runs (e.g. five "Linkedin Jobs Scraper"
  // rows) into one summary line per actor: latest status + total items + run count.
  const scrapeHealth = Object.values(
    runs.data.reduce<Record<string, { actorName: string; runs: number; items: number; latest?: string; status: string }>>(
      (acc, r) => {
        const key = r.actorName ?? "Unknown";
        const g = (acc[key] ??= { actorName: key, runs: 0, items: 0, latest: r.startedAt, status: r.status });
        g.runs += 1;
        g.items += r.itemCount ?? 0;
        if ((r.startedAt ?? "") >= (g.latest ?? "")) {
          g.latest = r.startedAt;
          g.status = r.status;
        }
        return acc;
      },
      {},
    ),
  )
    .sort((a, b) => (b.latest ?? "").localeCompare(a.latest ?? ""))
    .slice(0, 5);

  return (
    <>
      <Header
        title="Overview"
        subtitle="End-to-end view of the job search — listings, outreach, applications, interviews."
      />
      <main className="p-8 space-y-6">
        {/* KPI row — each tile drills into its detail page */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <Card href="/targets">
            <div className="p-6">
              <Stat
                label="Target Companies"
                value={s.targets}
                hint="H1B-friendly + Bay Area/Remote"
              />
            </div>
          </Card>
          <Card href="/listings">
            <div className="p-6">
              <Stat
                label="Job Listings"
                value={s.listings.total}
                hint={`${s.listings.new} new · ${s.listings.applied} applied`}
              />
            </div>
          </Card>
          <Card href="/outreach">
            <div className="p-6">
              <Stat
                label="Outreach"
                value={s.outreach.total}
                hint={`${s.outreach.sent} sent · ${s.outreach.replied} replied`}
                trend={s.outreach.replied > 0 ? "up" : "flat"}
                trendLabel={
                  s.outreach.sent ? `${pct(s.outreach.replied, s.outreach.sent)} reply rate` : undefined
                }
              />
            </div>
          </Card>
          <Card href="/applications">
            <div className="p-6">
              <Stat
                label="Applications"
                value={s.applications.total}
                hint={`${s.applications.interviewing} interviewing · ${s.applications.offered} offered`}
                trend={s.applications.offered ? "up" : s.applications.rejected ? "down" : "flat"}
                trendLabel={
                  s.applications.total
                    ? `${pct(s.applications.rejected, s.applications.total)} rejected`
                    : undefined
                }
              />
            </div>
          </Card>
        </div>

        {/* Funnel + Sources */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Pipeline funnel"
              subtitle="Conversion from target list to offer"
              right={<SourceBadge source={summary.source} />}
            />
            <CardBody>
              <Funnel
                stages={s.funnel.map((f) => ({ ...f, href: FUNNEL_ROUTES[f.stage] }))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Scrape health"
              subtitle="Recent Apify actor runs"
              right={
                <div className="flex items-center gap-3">
                  <ViewAllLink href="/listings" />
                  <SourceBadge source={runs.source} />
                </div>
              }
            />
            <CardBody padded={false}>
              <ul className="divide-y divide-brand-subtleBorder">
                {scrapeHealth.map((g) => (
                  <li key={g.actorName} className="px-6 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-brand-heading truncate">
                        {g.actorName}
                      </p>
                      <p className="text-[11px] text-brand-muted">
                        {formatRelative(g.latest)}
                        {` · ${g.items} items`}
                        {g.runs > 1 ? ` · ${g.runs} runs` : ""}
                      </p>
                    </div>
                    <StatusBadge
                      label={g.status}
                      color={statusColor(
                        g.status === "SUCCEEDED"
                          ? "approved"
                          : g.status === "FAILED"
                            ? "rejected"
                            : g.status === "RUNNING"
                              ? "in_progress"
                              : "pending",
                      )}
                    />
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>

        {/* Two-up: recent apps + recent outreach */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader
              title="Recent applications"
              subtitle="Last 5 submitted"
              right={
                <div className="flex items-center gap-3">
                  <ViewAllLink href="/applications" />
                  <SourceBadge source={apps.source} />
                </div>
              }
            />
            <CardBody padded={false}>
              <DataTable<Application>
                rowKey={(r) => r.id}
                rows={recentApps}
                columns={[
                  { key: "company", header: "Company", render: (r) => <span className="font-medium text-brand-heading">{r.company}</span> },
                  { key: "role", header: "Role", render: (r) => <span className="text-brand-body">{r.jobTitle}</span> },
                  { key: "status", header: "Status", render: (r) => <StatusBadge label={r.status} /> },
                  { key: "stage", header: "Stage", render: (r) => <StatusBadge label={r.interviewStage} /> },
                ]}
                empty="No applications submitted yet."
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Recent outreach"
              subtitle="Last 5 reachouts"
              right={
                <div className="flex items-center gap-3">
                  <ViewAllLink href="/outreach" />
                  <SourceBadge source={outreach.source} />
                </div>
              }
            />
            <CardBody padded={false}>
              <DataTable<OutreachContact>
                rowKey={(r) => `${r.source}:${r.id}`}
                rows={recentOutreach}
                columns={[
                  { key: "base", header: "", width: "80px", render: (r) => <BaseTag source={r.source} /> },
                  { key: "company", header: "Company", render: (r) => <span className="font-medium text-brand-heading">{r.company}</span> },
                  { key: "contact", header: "Contact", render: (r) => r.contactName ?? "—" },
                  { key: "status", header: "Status", render: (r) => <StatusBadge label={r.status} /> },
                ]}
                empty="No outreach yet."
              />
            </CardBody>
          </Card>
        </div>

        {/* Apollo sequences */}
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader
              title="Apollo sequences"
              subtitle="Outreach campaigns"
              right={
                <div className="flex items-center gap-3">
                  <ViewAllLink href="/outreach" />
                  <SourceBadge source={sequences.source} />
                </div>
              }
            />
            <CardBody padded={false}>
              {sequences.data.length === 0 ? (
                <div className="px-6 py-10 text-center text-[13px] text-brand-muted">
                  No active sequences. Outreach is currently tracked manually in Airtable.
                </div>
              ) : (
                <DataTable<ApolloSequence>
                  rowKey={(r) => r.id}
                  rows={sequences.data}
                  columns={[
                    {
                      key: "name",
                      header: "Sequence",
                      render: (r) => (
                        <span className="font-medium text-brand-heading">{r.name}</span>
                      ),
                    },
                    {
                      key: "contacts",
                      header: "Contacts",
                      render: (r) => r.numContacts,
                      align: "right",
                    },
                    { key: "sent", header: "Sent", render: (r) => r.numSent ?? 0, align: "right" },
                    {
                      key: "replied",
                      header: "Replied",
                      render: (r) => `${r.numReplied ?? 0} (${pct(r.numReplied ?? 0, r.numSent ?? 0)})`,
                      align: "right",
                    },
                  ]}
                />
              )}
            </CardBody>
          </Card>
        </div>
      </main>
    </>
  );
}
