// /admin — user table + support tools (PRD §7.9). Admin-only: the (admin)
// route-group layout gates, and this page re-asserts itself (layouts don't
// re-run on soft navigation).

import { requireAdmin } from "@/lib/session";
import { isOwner } from "@/lib/auth-shared";
import {
  listUsersAllAdmin,
  listJobListings,
  listApplications,
  listOutreach,
  type AdminUserRow,
} from "@/lib/airtable";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatRelative } from "@/lib/utils";
import type { StatusColor } from "@/lib/types";
import { AdminActions, MigrateButton } from "./AdminActions";

export const dynamic = "force-dynamic";

// Row-count fan-out cap (3 owner-filtered reads per user, 30s-cached).
const COUNT_CAP = 10;

interface AdminRow extends AdminUserRow {
  counts: { listings: number; applications: number; outreach: number };
  isSelf: boolean;
}

// §7.1 avatar-initials rule: first letter of first + last word of Name;
// single word → first two letters; no name → first two chars of the email
// local part. Uppercased, max 2.
function initials(name: string | undefined, email: string): string {
  const n = (name ?? "").trim();
  if (n) {
    const words = n.split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  return email.split("@")[0].slice(0, 2).toUpperCase();
}

const ACCOUNT_COLOR: Record<string, StatusColor> = {
  active: "green",
  pending: "yellow",
  disabled: "red",
};
const ONBOARDING_COLOR: Record<string, StatusColor> = {
  complete: "green",
  pending: "yellow",
};

async function loadRows(adminEmail: string): Promise<AdminRow[]> {
  let users: AdminUserRow[] = [];
  try {
    users = await listUsersAllAdmin();
  } catch (e) {
    console.error("admin: user list failed", e);
    return [];
  }
  const out: AdminRow[] = [];
  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    let counts = { listings: 0, applications: 0, outreach: 0 };
    if (i < COUNT_CAP && u.email) {
      try {
        const [l, a, o] = await Promise.all([
          listJobListings(u.email),
          listApplications(u.email),
          listOutreach(u.email),
        ]);
        counts = { listings: l.length, applications: a.length, outreach: o.length };
      } catch (e) {
        console.error(`admin: counts failed for ${u.email}`, e);
      }
    }
    out.push({ ...u, counts, isSelf: u.email === adminEmail });
  }
  return out;
}

export default async function AdminPage() {
  const { email: adminEmail } = await requireAdmin();
  const rows = await loadRows(adminEmail);

  return (
    <>
      <Header title="Admin" subtitle="Users and support tools" />
      <main className="p-5 md:p-8 space-y-6">
        <Card>
          <CardHeader
            title="Users"
            subtitle={`${rows.length} registered account${rows.length === 1 ? "" : "s"}`}
          />
          <CardBody padded={false}>
            <DataTable<AdminRow>
              rowKey={(r) => r.id}
              empty="Only you so far. Users appear here after their first Google sign-in."
              columns={[
                {
                  key: "user",
                  header: "User",
                  render: (r) => (
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        title={r.name ?? undefined}
                        className="w-8 h-8 rounded-full bg-brand-ink text-white flex items-center justify-center text-[12px] font-semibold shrink-0"
                      >
                        {initials(r.name, r.email)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-brand-heading truncate">
                          {r.name || "—"}
                          {r.isSelf && <span className="ml-2 text-[11px] text-brand-muted">(you)</span>}
                        </div>
                        <div className="text-[12px] text-brand-muted truncate">{r.email}</div>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "account",
                  header: "Account",
                  render: (r) => (
                    <StatusBadge
                      label={r.accountStatus}
                      color={ACCOUNT_COLOR[r.accountStatus ?? ""] ?? "gray"}
                    />
                  ),
                },
                {
                  key: "onboarding",
                  header: "Onboarding",
                  render: (r) => (
                    <StatusBadge
                      label={r.onboardingStatus}
                      color={ONBOARDING_COLOR[r.onboardingStatus ?? ""] ?? "gray"}
                    />
                  ),
                },
                {
                  key: "lastLogin",
                  header: "Last login",
                  render: (r) => <span className="text-brand-muted">{formatRelative(r.lastLogin)}</span>,
                },
                {
                  key: "counts",
                  header: "Rows",
                  render: (r) => (
                    <span className="tabular-nums text-brand-muted whitespace-nowrap">
                      L {r.counts.listings} · A {r.counts.applications} · O {r.counts.outreach}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  header: "Actions",
                  align: "right",
                  render: (r) => (
                    <AdminActions
                      email={r.email}
                      accountStatus={r.accountStatus ?? ""}
                      isSelf={r.isSelf}
                    />
                  ),
                },
              ]}
              rows={rows}
            />
            <p className="px-6 py-3 border-t border-brand-subtleBorder text-[12px] text-brand-muted">
              View-as sessions are recorded (admin, target user, start/end).
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Data migration"
            subtitle="Stamp legacy rows with the owner email and seed the owner account. Idempotent — safe to re-run."
          />
          <CardBody>
            <MigrateButton />
          </CardBody>
        </Card>
      </main>
    </>
  );
}
