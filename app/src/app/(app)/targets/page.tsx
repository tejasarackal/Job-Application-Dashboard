import { Header } from "@/components/layout/Header";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { Stat } from "@/components/ui/Stat";
import { ActivationBanner } from "@/components/targets/ActivationBanner";
import {
  TargetCompanyEditor,
  type EditorDeviation,
  type EditorMasterRow,
} from "@/components/targets/TargetCompanyEditor";
import { listUserTargets } from "@/lib/airtable";
import { getTargets } from "@/lib/fetcher";
import { getViewContext } from "@/lib/session";
import { getUserRow } from "@/lib/users";
import { normalizeCompany } from "@/lib/workflows/filters";
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

// Editor inputs: master rows keyed by filters.ts#normalizeCompany (the same
// canonical key lib/targets.ts and the PUT route use), first row wins on
// duplicate keys.
function editorMaster(companies: TargetCompany[]): EditorMasterRow[] {
  const out: EditorMasterRow[] = [];
  const seen = new Set<string>();
  for (const t of companies) {
    const key = normalizeCompany(t.employer);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name: t.employer, sector: t.sector, ats: t.ats, bayArea: t.bayArea });
  }
  return out;
}

export default async function TargetsPage() {
  // Session-scope the page (PRD §5.2). getTargets() reads the shared H1B
  // master list — unowned by design (§6.3); the EDITOR is per-user, scoped to
  // ctx.effectiveEmail (view-as renders the member's selection, read-only).
  const ctx = await getViewContext();
  const { data, source } = await getTargets();
  const companies = dedupeByEmployer(data);

  // Per-user editor state: sparse deviation rows + the Users-row mode flag.
  // Airtable unreachable/unconfigured → empty deviations + default mode (the
  // editor still renders; saves go through PUT /api/targets/user regardless).
  const deviationRows = await listUserTargets(ctx.effectiveEmail).catch(() => []);
  const userRow = await getUserRow(ctx.effectiveEmail).catch(() => null);
  const mode: "h1b_all" | "none" = userRow?.defaultTargets === "none" ? "none" : "h1b_all";
  const master = editorMaster(companies);
  const deviations: EditorDeviation[] = deviationRows
    .filter((d) => d.status === "excluded" || d.status === "added")
    .map((d) => ({
      companyKey: d.companyKey,
      status: d.status as "excluded" | "added",
      companyName: d.companyName,
      careersUrl: d.careersUrl,
      h1bVerified: d.h1bVerified,
    }));

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

        <ActivationBanner count={master.length} />

        <Card>
          <CardHeader
            title="My target companies"
            subtitle={`Start from ${master.length} verified H1B sponsors — uncheck, add your own, or opt out`}
          />
          <CardBody padded={false}>
            <TargetCompanyEditor
              mode={mode}
              master={master}
              deviations={deviations}
              isViewAs={ctx.isViewAs}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="All target companies (reference)"
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
