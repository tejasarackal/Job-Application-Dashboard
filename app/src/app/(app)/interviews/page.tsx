import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Stat } from "@/components/ui/Stat";
import { Funnel } from "@/components/ui/Funnel";
import { getApplications, getInterviews } from "@/lib/fetcher";
import { getViewContext } from "@/lib/session";
import { formatDate, statusColor } from "@/lib/utils";
import type { Interview } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Interviews" };

// Reads the dedicated Interviews table (Job Outreach base), populated from
// Gmail by automate-job-search/_instructions_gmail_scrape_interviews.md.
const STAGES = [
  "Recruiter Screen",
  "Technical Screen",
  "Take Home",
  "Hiring Manager",
  "System Design",
  "Behavioral",
  "Onsite / Final",
  "Offer",
];

const ACTIVE_STATUSES = ["Scheduled", "Awaiting Feedback"];

export default async function InterviewsPage() {
  const ctx = await getViewContext();
  const [{ data, source }, applications] = await Promise.all([
    getInterviews(ctx.effectiveEmail),
    getApplications(ctx.effectiveEmail),
  ]);
  // Interviews hang off applications — gate the CTA until one exists.
  const hasApplications = applications.data.length > 0;

  const active = data.filter((i) => ACTIVE_STATUSES.includes(i.status ?? ""));
  const offers = data.filter((i) => i.stage === "Offer").length;
  const furthest = [...STAGES].reverse().find((s) => data.some((i) => i.stage === s)) ?? "—";
  const nextFollow = data
    .map((i) => i.nextFollowUp)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  const stageCounts = STAGES.map((s) => ({
    stage: s,
    count: data.filter((i) => i.stage === s).length,
    color: statusColor(s),
  }));

  return (
    <>
      <Header title="Interviews" subtitle="Live interview pipeline — synced from Gmail into Airtable" />
      <main className="p-8 space-y-6">
        {!ctx.isViewAs && (
          <div className="flex items-center justify-end gap-3">
            {!hasApplications && (
              <span className="text-[12px] text-brand-muted">Log an application first</span>
            )}
            {hasApplications ? (
              <Link
                href="/interviews/new"
                className="bg-brand-ink text-white text-[12px] font-medium px-3 py-1.5 rounded-md hover:bg-brand-inkHover"
              >
                Log interview
              </Link>
            ) : (
              <span
                aria-disabled="true"
                className="bg-brand-ink text-white text-[12px] font-medium px-3 py-1.5 rounded-md opacity-50 cursor-not-allowed"
              >
                Log interview
              </span>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <Card><div className="p-6"><Stat label="Active" value={active.length} hint="Scheduled / awaiting feedback" /></div></Card>
          <Card><div className="p-6"><Stat label="Furthest stage" value={furthest} size="sm" hint="Most advanced stage reached" /></div></Card>
          <Card><div className="p-6"><Stat label="Offers" value={offers} hint="At offer stage" trend={offers ? "up" : "flat"} /></div></Card>
          <Card><div className="p-6"><Stat label="Next follow-up" value={nextFollow ? formatDate(nextFollow) : "None scheduled"} size="sm" hint="Soonest scheduled" /></div></Card>
        </div>

        <Card>
          <CardHeader
            title="Interview funnel"
            subtitle="Count of interviews at each stage"
            right={<SourceBadge source={source} />}
          />
          <CardBody>
            <Funnel stages={stageCounts} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="All interviews"
            subtitle="Every recorded round, newest first"
            right={<SourceBadge source={source} />}
          />
          <CardBody padded={false}>
            <DataTable<Interview>
              rowKey={(r) => r.id}
              rows={[...data].sort((a, b) => (b.scheduledAt ?? "").localeCompare(a.scheduledAt ?? ""))}
              columns={[
                { key: "company", header: "Company", render: (r) => <span className="font-medium text-brand-heading">{r.company}</span> },
                { key: "role", header: "Role", render: (r) => <span className="text-brand-body">{r.role ?? "—"}</span> },
                {
                  key: "interviewer",
                  header: "Interviewer",
                  render: (r) => (
                    <div>
                      <p className="text-brand-heading">{r.interviewer ?? "—"}</p>
                      {r.interviewerTitle && <p className="text-[11px] text-brand-muted">{r.interviewerTitle}</p>}
                    </div>
                  ),
                },
                { key: "stage", header: "Stage", render: (r) => <StatusBadge label={r.stage} /> },
                { key: "status", header: "Status", render: (r) => <StatusBadge label={r.status} /> },
                { key: "scheduled", header: "Scheduled", render: (r) => <span className="text-brand-muted text-[12px]">{formatDate(r.scheduledAt)}</span> },
                {
                  key: "follow",
                  header: "Next follow-up",
                  render: (r) =>
                    r.nextFollowUp ? (
                      <span className="text-status-orange-fg text-[12px] font-medium">{formatDate(r.nextFollowUp)}</span>
                    ) : (
                      <span className="text-brand-muted text-[12px]">—</span>
                    ),
                },
                {
                  key: "link",
                  header: "Call",
                  render: (r) =>
                    r.callLink ? (
                      <a href={r.callLink} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-brand-ink hover:text-brand-inkHover">
                        Join →
                      </a>
                    ) : (
                      <span className="text-brand-muted text-[12px]">—</span>
                    ),
                },
              ]}
              empty="No interviews yet. They'll appear here when you log one against an application."
            />
          </CardBody>
        </Card>
      </main>
    </>
  );
}
