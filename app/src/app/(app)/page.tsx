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
import { classNames, formatRelative, pct, statusColor } from "@/lib/utils";
import { pct5 } from "@/components/ui/ratio";
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
  // Automation modules (Apify scrape health, Apollo sequences) are admin-only
  // and hidden entirely under view-as — pixel-faithful member view (§7.8).
  // When hidden, nothing replaces them and their data is never fetched.
  const showAutomation = ctx.isAdmin && !ctx.isViewAs;
  const [summary, apps, outreach, sequences, runs] = await Promise.all([
    getSummary(ctx.effectiveEmail),
    getApplications(ctx.effectiveEmail),
    getOutreach(ctx.effectiveEmail),
    showAutomation ? getSequences() : Promise.resolve(null),
    showAutomation ? getApifyRuns() : Promise.resolve(null),
  ]);

  const s = summary.data;
  // Dashboard state (§7.8): activity counts what the user has actually done.
  // Targets is deliberately excluded — a seeded target list alone is still S0,
  // so the funnel never renders when Targets is the only nonzero stage.
  const interviewCount = s.funnel.find((f) => f.stage === "Interviewing")?.count ?? 0;
  const activity = s.listings.total + s.applications.total + s.outreach.total + interviewCount;
  const recentApps = [...apps.data]
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
    .slice(0, 5);
  const recentOutreach = [...outreach.data]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 5);

  // Collapse the repeated per-actor runs (e.g. five "Linkedin Jobs Scraper"
  // rows) into one summary line per actor: latest status + total items + run count.
  const scrapeHealth = Object.values(
    (runs?.data ?? []).reduce<Record<string, { actorName: string; runs: number; items: number; latest?: string; status: string }>>(
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
                // "tracked", not "new" — "new" implies scraper inflow members
                // don't have (§7.8).
                hint={`${s.listings.total} tracked · ${s.listings.applied} applied`}
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
                // Suppressed ("—") until the denominator reaches 5 (§7.8).
                trendLabel={
                  s.outreach.sent ? `${pct5(s.outreach.replied, s.outreach.sent)} reply rate` : undefined
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
                // Suppressed ("—") until the denominator reaches 5 (§7.8).
                trendLabel={
                  s.applications.total
                    ? `${pct5(s.applications.rejected, s.applications.total)} rejected`
                    : undefined
                }
              />
            </div>
          </Card>
        </div>

        {/* Funnel (or the S0 empty state) + admin-only scrape health. When the
            automation card is hidden the grid drops to one column and the
            funnel card takes the full row — nothing replaces the card. */}
        <div className={classNames("grid grid-cols-1 gap-6", showAutomation && "lg:grid-cols-3")}>
          {activity === 0 ? (
            <Card className={showAutomation ? "lg:col-span-2" : undefined}>
              <CardBody>
                <div className="px-2 py-12 text-center">
                  <h2 className="text-[16px] font-semibold text-brand-heading">
                    Your pipeline starts here.
                  </h2>
                  <p className="mt-1.5 text-[13px] text-brand-body">
                    Add roles as you find them — your funnel builds as you track applications.
                  </p>
                  {/* Wave 3: point at /listings/new */}
                  <Link
                    href="/listings"
                    className="mt-5 inline-block px-4 py-2 rounded-md bg-brand-ink text-white text-[13px] font-medium hover:bg-brand-inkHover"
                  >
                    Add your first listing
                  </Link>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card className={showAutomation ? "lg:col-span-2" : undefined}>
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
          )}

          {showAutomation && runs && (
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
          )}
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
                empty="No applications tracked. Add one when you submit your next application."
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
                empty="No outreach tracked. Log contacts manually — automated research and drafting are not enabled for member accounts in this release."
              />
            </CardBody>
          </Card>
        </div>

        {/* Apollo sequences — admin-only automation module (§7.8); hidden
            entirely for members and under view-as. */}
        {showAutomation && sequences && (
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
        )}
      </main>
    </>
  );
}
