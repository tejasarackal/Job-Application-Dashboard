import { Header } from "@/components/layout/Header";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Stat } from "@/components/ui/Stat";
import { getApplications } from "@/lib/fetcher";
import { formatDate, pct } from "@/lib/utils";
import type { Application } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Applications" };

export default async function ApplicationsPage() {
  const { data, source } = await getApplications();

  const total = data.length;
  const interviewing = data.filter((a) => a.status === "interviewing").length;
  const offered = data.filter((a) => a.status === "offered").length;
  const rejected = data.filter((a) => a.status === "rejected").length;

  // Pin "active" applications — a stage has been reached and the status isn't a
  // dead end — to the top for quick access; everything else stays newest-first.
  const TERMINAL = new Set(["rejected", "withdrawn", "ghosted"]);
  const isActive = (a: Application) => Boolean(a.interviewStage) && !TERMINAL.has(a.status ?? "");
  const rows = [...data].sort(
    (a, b) =>
      (isActive(a) ? 0 : 1) - (isActive(b) ? 0 : 1) ||
      (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""),
  );

  return (
    <>
      <Header
        title="Applications"
        subtitle="Every application you've submitted, with current status and stage"
      />
      <main className="p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <Card><div className="p-6"><Stat label="Total" value={total} hint="All submissions" /></div></Card>
          <Card>
            <div className="p-6">
              <Stat
                label="Interviewing"
                value={interviewing}
                hint={total ? `${pct(interviewing, total)} of submitted` : undefined}
                trend={interviewing > 0 ? "up" : "flat"}
              />
            </div>
          </Card>
          <Card>
            <div className="p-6">
              <Stat
                label="Offered"
                value={offered}
                hint={total ? `${pct(offered, total)} offer rate` : undefined}
                trend={offered > 0 ? "up" : "flat"}
              />
            </div>
          </Card>
          <Card>
            <div className="p-6">
              <Stat
                label="Rejected"
                value={rejected}
                hint={total ? `${pct(rejected, total)} of submitted` : undefined}
                trend={rejected > offered ? "down" : "flat"}
              />
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="All applications"
            subtitle="Active interviews pinned on top, then newest first"
            right={<SourceBadge source={source} />}
          />
          <CardBody padded={false}>
            <DataTable<Application>
              rowKey={(r) => r.id}
              rows={rows}
              columns={[
                {
                  key: "company",
                  header: "Company",
                  render: (r) => (
                    <span className="font-medium text-brand-heading">
                      {isActive(r) && (
                        <span
                          title="Active interview"
                          className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full bg-status-teal-fg align-middle"
                        />
                      )}
                      {r.company}
                    </span>
                  ),
                },
                {
                  key: "role",
                  header: "Role",
                  render: (r) => (
                    <div>
                      <p className="text-brand-body">{r.jobTitle}</p>
                      <p className="text-[10.5px] text-brand-muted font-mono">{r.applicationId}</p>
                    </div>
                  ),
                },
                { key: "board", header: "Board", render: (r) => <StatusBadge label={r.board} /> },
                { key: "status", header: "Status", render: (r) => <StatusBadge label={r.status} /> },
                {
                  key: "stage",
                  header: "Stage",
                  render: (r) => <StatusBadge label={r.interviewStage} />,
                },
                {
                  key: "submitted",
                  header: "Submitted",
                  render: (r) => <span className="text-brand-muted text-[12px]">{formatDate(r.submittedAt)}</span>,
                },
                {
                  key: "follow",
                  header: "Follow-up",
                  render: (r) =>
                    r.followUpDate ? (
                      <span
                        className={
                          r.followUpDone ? "text-brand-muted text-[12px]" : "text-status-orange-fg text-[12px] font-medium"
                        }
                      >
                        {formatDate(r.followUpDate)}{r.followUpDone ? " ✓" : ""}
                      </span>
                    ) : (
                      <span className="text-brand-muted text-[12px]">—</span>
                    ),
                },
                {
                  key: "link",
                  header: "",
                  align: "right",
                  render: (r) =>
                    r.jobUrl ? (
                      <a
                        href={r.jobUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-brand-ink hover:text-brand-inkHover text-[12px] font-medium"
                      >
                        Open ↗
                      </a>
                    ) : null,
                },
              ]}
              empty="No applications submitted yet."
            />
          </CardBody>
        </Card>
      </main>
    </>
  );
}
