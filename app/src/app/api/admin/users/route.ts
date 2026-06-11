// GET/POST /api/admin/users — admin user list (+ per-user row counts) and
// disable/enable actions (PRD §7.9, D14). Admin-only; POST is origin-checked.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAdminApi,
  assertSameOrigin,
  getViewContext,
  assertWritable,
  handleAuthError,
} from "@/lib/session";
import { isOwner, normalizeEmail } from "@/lib/auth-shared";
import { getUserRow } from "@/lib/users";
import {
  listUsersAllAdmin,
  listJobListings,
  listApplications,
  listOutreach,
  logAdminAudit,
  updateRecords,
  usersTable,
  primaryBase,
  FIELDS,
} from "@/lib/airtable";

export const dynamic = "force-dynamic";

// Row-count fan-out cap: 3 owner-filtered reads per user against a 5 rps base.
// USER_CAP is 10 in MVP, so this covers everyone; beyond it, counts read 0.
const COUNT_CAP = 10;

interface UserCounts {
  listings: number;
  applications: number;
  outreach: number;
}

export async function GET() {
  try {
    await requireAdminApi();

    const rows = await listUsersAllAdmin();
    const users = [];
    for (let i = 0; i < rows.length; i++) {
      const u = rows[i];
      let counts: UserCounts = { listings: 0, applications: 0, outreach: 0 };
      if (i < COUNT_CAP && u.email) {
        try {
          // 30s-cached reads (default) are fine here — sequential per user to
          // stay friendly with the 5 rps base limit.
          const [l, a, o] = await Promise.all([
            listJobListings(u.email),
            listApplications(u.email),
            listOutreach(u.email),
          ]);
          counts = { listings: l.length, applications: a.length, outreach: o.length };
        } catch (e) {
          // A malformed email or upstream blip must not 500 the whole list.
          console.error(`admin/users: counts failed for ${u.email}`, e);
        }
      }
      users.push({
        email: u.email,
        name: u.name ?? null,
        accountStatus: u.accountStatus ?? null,
        onboardingStatus: u.onboardingStatus ?? null,
        lastLogin: u.lastLogin ?? null,
        counts,
      });
    }

    return NextResponse.json({ ok: true, users });
  } catch (e) {
    return handleAuthError(e);
  }
}

const postSchema = z.object({
  email: z.string(),
  action: z.enum(["disable", "enable"]),
});

export async function POST(req: NextRequest) {
  try {
    const { email: admin } = await requireAdminApi();
    assertSameOrigin(req);
    assertWritable(await getViewContext()); // never mutate accounts under view-as (D7)

    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "email and action required" }, { status: 400 });
    }
    const target = normalizeEmail(parsed.data.email);
    const action = parsed.data.action;

    if (isOwner(target)) {
      return NextResponse.json(
        { ok: false, error: "cannot disable the owner account" },
        { status: 400 },
      );
    }

    // Find the Users record id: keyed lookup first; the admin list as a
    // fallback (e.g. duplicate-row anomaly makes getUserRow throw/fail).
    let recordId: string | undefined;
    try {
      recordId = (await getUserRow(target))?.id;
    } catch {
      recordId = undefined;
    }
    if (!recordId) {
      recordId = (await listUsersAllAdmin()).find((u) => u.email === target)?.id;
    }
    if (!recordId) {
      return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
    }

    await updateRecords(usersTable(), primaryBase(), [
      {
        id: recordId,
        fields: { [FIELDS.users.accountStatus]: action === "disable" ? "disabled" : "active" },
      },
    ]);
    await logAdminAudit(action === "disable" ? "user_disable" : "user_enable", admin, target);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleAuthError(e);
  }
}
