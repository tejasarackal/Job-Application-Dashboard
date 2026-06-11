import { Header } from "@/components/layout/Header";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Stat } from "@/components/ui/Stat";
import { getTargets } from "@/lib/fetcher";
import { getViewContext } from "@/lib/session";
import type { StatusColor, TargetCompany } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Target Companies" };

// ATS → status palette color (badge text is humanized by StatusBadge).
const ATS_COLOR: Record<string, StatusColor> = {
  greenhouse: "green",
  lever: "blue",
  workday: "purple",
  custom: "orange",
  unknown: "gray",
};

// Normalize an employer name so near-duplicates collapse: drop punctuation and
// common legal suffixes ("Apple Inc." vs "Apple Inc" → "apple").
function normalizeEmployer(name?: string): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|ltd|corp|corporation|co|plc|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Collapse duplicate employer rows, keeping the highest-LCA copy. Source dedup
// in Airtable is preferred; this keeps the UI honest (and counts accurate) until then.
function dedupeByEmployer(rows: TargetCompany[]): TargetCompany[] {
  const seen = new Set<string>();
  return [...rows]
    .sort((a, b) => (b.lcaCount ?? 0) - (a.lcaCount ?? 0))
    .filter((t) => {
      const key = normalizeEmployer(t.employer) || t.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export default async function TargetsPage() {
  // Session-scope the page (PRD §5.2). getTargets() reads the shared H1B
  // master list — unowned by design (§6.3), so no email is threaded here.
  await getViewContext();
  const { data, source } = await getTargets();
  const companies = dedupeByEmployer(data);

  const total = companies.length;
  const done = companies.filter((t) => t.status === "done").length;
  const inProgress = companies.filter((t) => t.status === "in_progress").length;
  const bayArea = companies.filter((t) => t.bayArea).length;

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
              rows={companies}
              columns={[
                {
                  key: "employer",
                  header: "Employer",
                  render: (r) =>
                    r.careersUrl ? (
                      <a
                        href={r.careersUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-brand-ink hover:text-brand-inkHover hover:underline"
                      >
                        {r.employer}
                      </a>
                    ) : (
                      <span className="font-medium text-brand-heading">{r.employer}</span>
                    ),
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
                {
                  key: "ats",
                  header: "ATS",
                  render: (r) => <StatusBadge label={r.ats} color={ATS_COLOR[r.ats ?? ""] ?? "gray"} />,
                },
              ]}
              empty="No target companies. Populate the H1B_Companies table."
            />
          </CardBody>
        </Card>
      </main>
    </>
  );
}
