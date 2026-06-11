import { Header } from "@/components/layout/Header";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { getWorkflowRuns } from "@/lib/fetcher";
import { getViewContext } from "@/lib/session";
import type { WorkflowRun } from "@/lib/types";
import { RunButton } from "./RunButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Workflows" };

// Static catalog of the workflows the engine runs. See docs/plan/PRD-workflow-engine.md.
const WORKFLOWS: { name: string; title: string; desc: string }[] = [
  { name: "scrape_jobs", title: "Job Scraping", desc: "Apify job boards → Job Listings" },
  { name: "revalidate_listings", title: "Revalidate Links", desc: "Expire listings whose posting has closed (dead links → Expired). Free, no Apify." },
  { name: "detect_boards", title: "Detect Boards", desc: "Resolve & repair Workday board tokens in Scrape Targets" },
  { name: "sync_applications", title: "Application Sync", desc: "Gmail → Application statuses" },
  { name: "sync_interviews", title: "Interview Sync", desc: "Gmail → Interviews" },
  { name: "research", title: "Lead Research", desc: "Apollo → leads. Approve in Outreach Review." },
  { name: "draft_emails", title: "Email Drafting", desc: "Approved leads → email draft. Approve in Outreach Review." },
];

// snake_case / camelCase engine counter keys → readable words for the UI
// (e.g. "droppedTitle" → "dropped title", "got_workday" → "got workday").
function humanizeKey(k: string): string {
  return k
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
}

function fmtCounts(counts?: string): string {
  if (!counts) return "—";
  try {
    const o = JSON.parse(counts) as Record<string, number>;
    const parts = Object.entries(o)
      .filter(([k]) => k !== "nextOffset" && k !== "cursor")
      .map(([k, v]) => `${humanizeKey(k)} ${v}`);
    return parts.length ? parts.join(" · ") : "—";
  } catch {
    return counts;
  }
}

function fmtTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function WorkflowsPage() {
  const ctx = await getViewContext();
  const { data: runs, source } = await getWorkflowRuns(ctx.effectiveEmail);

  return (
    <>
      <Header title="Workflows" subtitle="Trigger and monitor pipeline automations" />
      <main className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {WORKFLOWS.map((w) => (
            <Card key={w.name}>
              <div className="p-6 flex flex-col h-full">
                <h3 className="text-[15px] font-semibold text-brand-heading">{w.title}</h3>
                <p className="mt-1 text-[13px] text-brand-body flex-1">{w.desc}</p>
                <RunButton name={w.name} label={w.title} />
              </div>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader
            title="Run history"
            subtitle="Every workflow run is logged to the Workflow_Runs table"
            right={<SourceBadge source={source} />}
          />
          <CardBody padded={false}>
            <DataTable<WorkflowRun>
              rowKey={(r) => r.id}
              rows={runs}
              columns={[
                {
                  key: "workflow",
                  header: "Workflow",
                  render: (r) => <span className="font-medium text-brand-heading">{r.workflow ?? "—"}</span>,
                },
                { key: "trigger", header: "Trigger", render: (r) => <span className="text-brand-body">{r.trigger ?? "—"}</span> },
                { key: "status", header: "Status", render: (r) => <StatusBadge label={r.status ?? "—"} /> },
                { key: "started", header: "Started", render: (r) => <span className="text-brand-body">{fmtTime(r.startedAt)}</span> },
                { key: "finished", header: "Finished", render: (r) => <span className="text-brand-body">{fmtTime(r.finishedAt)}</span> },
                {
                  key: "counts",
                  header: "Counts",
                  render: (r) => <span className="font-mono text-[12px] text-brand-body">{fmtCounts(r.counts)}</span>,
                },
              ]}
              empty="No workflow runs yet. Triggers arrive in Phase 1."
            />
          </CardBody>
        </Card>
      </main>
    </>
  );
}
