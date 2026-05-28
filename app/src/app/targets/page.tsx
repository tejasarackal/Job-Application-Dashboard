import { Header } from "@/components/layout/Header";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Stat } from "@/components/ui/Stat";
import { getTargets } from "@/lib/fetcher";
import type { TargetCompany } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  const { data, source } = await getTargets();

  const total = data.length;
  const done = data.filter((t) => t.status === "done").length;
  const inProgress = data.filter((t) => t.status === "in_progress").length;
  const bayArea = data.filter((t) => t.bayArea).length;

  return (
    <>
      <Header
        title="Target Companies"
        subtitle="H1B-friendly employers with Bay Area / remote presence"
      />
      <main className="p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <Card><div className="p-6"><Stat label="Targets" value={total} hint="H1B-verified" /></div></Card>
          <Card><div className="p-6"><Stat label="Done" value={done} hint="Reached out / applied" /></div></Card>
          <Card><div className="p-6"><Stat label="In Progress" value={inProgress} hint="Active research" /></div></Card>
          <Card><div className="p-6"><Stat label="Bay Area" value={bayArea} hint="With local office" /></div></Card>
        </div>

        <Card>
          <CardHeader
            title="All target companies"
            subtitle="Sorted by LCA count (H1B sponsorship volume)"
            right={<SourceBadge source={source} />}
          />
          <CardBody padded={false}>
            <DataTable<TargetCompany>
              rowKey={(r) => r.id}
              rows={[...data].sort((a, b) => (b.lcaCount ?? 0) - (a.lcaCount ?? 0))}
              columns={[
                {
                  key: "employer",
                  header: "Employer",
                  render: (r) => <span className="font-medium text-brand-heading">{r.employer}</span>,
                },
                { key: "sector", header: "Sector", render: (r) => <span className="text-brand-body">{r.sector ?? "—"}</span> },
                { key: "city", header: "City", render: (r) => r.city ?? "—" },
                {
                  key: "lca",
                  header: "LCA",
                  align: "right",
                  render: (r) => <span className="font-mono text-[12px] text-brand-body">{r.lcaCount ?? 0}</span>,
                },
                {
                  key: "bay",
                  header: "Bay Area",
                  align: "center",
                  render: (r) => (r.bayArea ? <span className="text-status-teal-fg text-[14px]">✓</span> : <span className="text-brand-muted">—</span>),
                },
                {
                  key: "rem",
                  header: "Remote",
                  align: "center",
                  render: (r) => (r.remoteFriendly ? <span className="text-status-teal-fg text-[14px]">✓</span> : <span className="text-brand-muted">—</span>),
                },
                { key: "status", header: "Status", render: (r) => <StatusBadge label={r.status} /> },
              ]}
              empty="No target companies. Populate the H1B_Companies table."
            />
          </CardBody>
        </Card>
      </main>
    </>
  );
}
