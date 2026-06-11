import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { BaseTag } from "@/components/ui/BaseTag";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Stat } from "@/components/ui/Stat";
import { JobTrigger } from "@/components/workflows/JobTrigger";
import { getOutreach, getSequences } from "@/lib/fetcher";
import { getViewContext } from "@/lib/session";
import { formatRelative, pct } from "@/lib/utils";
import type { OutreachContact, ApolloSequence } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Outreach" };

export default async function OutreachPage() {
  const ctx = await getViewContext();
  // Apollo is an admin-only automation module (PRD §7.8) — hidden entirely
  // for members and under view-as; its data is never fetched in member view.
  const showAutomation = ctx.isAdmin && !ctx.isViewAs;
  const [outreach, sequences] = await Promise.all([
    getOutreach(ctx.effectiveEmail),
    showAutomation ? getSequences() : Promise.resolve(null),
  ]);

  const total = outreach.data.length;
  // Replies span both bases: Outreach.Status = "Replied", Leads.Status = "responded"
  const replied = outreach.data.filter((o) =>
    ["Replied", "responded"].includes(o.status ?? ""),
  ).length;
  const followUps = outreach.data.filter((o) => o.followUpNeeded).length;
  const interviewing = outreach.data.filter((o) => o.status === "Interviewing").length;
  const fromOutreachBase = outreach.data.filter((o) => o.source === "outreach").length;
  const fromLeadsBase = outreach.data.filter((o) => o.source === "leads").length;

  return (
    <>
      <Header
        title="Outreach"
        subtitle="Cold mail and referrals — tracked in Airtable, with Apollo and Gmail context"
      />
      <main className="p-8 space-y-6">
        {!ctx.isViewAs && (
          <div className="flex justify-end items-start gap-3">
            <JobTrigger workflow="research" idleLabel="Research leads" busyLabel="Researching…" />
            <Link
              href="/outreach/new"
              className="bg-white border border-brand-border text-brand-body text-[12px] font-medium px-3 py-1.5 rounded-md hover:bg-brand-canvas"
            >
              Log outreach
            </Link>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <div className="p-6">
              <Stat
                label="Total Reachouts"
                value={total}
                hint={`${fromOutreachBase} Outreach · ${fromLeadsBase} Leads`}
              />
            </div>
          </Card>
          <Card>
            <div className="p-6">
              <Stat
                label="Replied"
                value={replied}
                hint={total ? `${pct(replied, total)} reply rate` : undefined}
                trend={replied > 0 ? "up" : "flat"}
              />
            </div>
          </Card>
          <Card><div className="p-6"><Stat label="Follow-ups Due" value={followUps} hint="Flagged for next touch" /></div></Card>
          <Card><div className="p-6"><Stat label="Interviewing" value={interviewing} hint="From outreach path" /></div></Card>
        </div>

        <Card>
          <CardHeader
            title="All reachouts"
            subtitle="Merged across both Airtable bases — Outreach (manual) and Leads (sourced)"
            right={<SourceBadge source={outreach.source} />}
          />
          <CardBody padded={false}>
            <DataTable<OutreachContact>
              rowKey={(r) => `${r.source}:${r.id}`}
              rows={outreach.data}
              columns={[
                {
                  key: "base",
                  header: "Base",
                  width: "90px",
                  render: (r) => <BaseTag source={r.source} />,
                },
                {
                  key: "company",
                  header: "Company",
                  render: (r) => <span className="font-medium text-brand-heading">{r.company}</span>,
                },
                {
                  key: "contact",
                  header: "Contact",
                  render: (r) => (
                    <div>
                      <p className="text-brand-heading">{r.contactName ?? "—"}</p>
                      {r.title && <p className="text-[11px] text-brand-muted">{r.title}</p>}
                    </div>
                  ),
                },
                { key: "channel", header: "Channel", render: (r) => <StatusBadge label={r.channel} /> },
                { key: "status", header: "Status", render: (r) => <StatusBadge label={r.status} /> },
                {
                  key: "stage",
                  header: "Stage",
                  render: (r) => <StatusBadge label={r.interviewStage} />,
                },
                {
                  key: "followup",
                  header: "Follow-up",
                  render: (r) =>
                    r.followUpNeeded ? (
                      <span className="text-status-orange-fg text-[12px] font-medium">Needed</span>
                    ) : (
                      <span className="text-brand-muted text-[12px]">—</span>
                    ),
                },
                {
                  key: "date",
                  header: "Last touch",
                  render: (r) => (
                    <span className="text-brand-muted text-[12px]">{formatRelative(r.lastCommunication ?? r.date)}</span>
                  ),
                },
              ]}
              empty="No outreach yet. Click Research leads to find recruiters at your target companies, or log a contact manually."
            />
          </CardBody>
        </Card>

        {showAutomation && sequences && (
        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardHeader
              title="Apollo sequences"
              subtitle="Bulk outreach campaigns"
              right={<SourceBadge source={sequences.source} />}
            />
            <CardBody padded={false}>
              {sequences.data.length === 0 ? (
                <div className="px-6 py-10 text-center text-[13px] text-brand-muted">
                  No active sequences. Create one in Apollo to bulk-warm a list of recruiters.
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
                        <div>
                          <p className="font-medium text-brand-heading">{r.name}</p>
                          <p className="text-[11px] text-brand-muted">
                            {r.active ? "Active" : "Paused"}
                          </p>
                        </div>
                      ),
                    },
                    { key: "c", header: "Contacts", render: (r) => r.numContacts, align: "right" },
                    { key: "s", header: "Sent", render: (r) => r.numSent ?? 0, align: "right" },
                    {
                      key: "o",
                      header: "Opened",
                      render: (r) => `${r.numOpened ?? 0} (${pct(r.numOpened ?? 0, r.numSent ?? 0)})`,
                      align: "right",
                    },
                    {
                      key: "r",
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
