// POST/DELETE /api/admin/view-as — enter/exit the admin view-as session
// (PRD D7/§5.5). Admin-only + same-origin on both verbs.
//
// POST { email }: target Users row must exist; the `view_as_enter` audit row is
// written BEFORE the cookie — if the audit write fails, entry is DENIED (503,
// no cookie). Cookie: httpOnly + Secure + SameSite=Lax + Max-Age 3600 + path /.
// DELETE: best-effort `view_as_exit` audit, then clear the cookie.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAdminApi,
  assertSameOrigin,
  getViewContext,
  assertWritable,
  handleAuthError,
} from "@/lib/session";
import { normalizeEmail } from "@/lib/auth-shared";
import { getUserRow } from "@/lib/users";
import { logAdminAudit } from "@/lib/airtable";
import { createViewAsToken, verifyViewAsToken, VIEWAS_COOKIE, VIEWAS_MAX_AGE_S } from "@/lib/viewas";

export const dynamic = "force-dynamic";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
};

const postSchema = z.object({ email: z.string() });

export async function POST(req: NextRequest) {
  try {
    const { email: admin } = await requireAdminApi();
    assertSameOrigin(req);
    // Already in view-as → exit first (also keeps this mutating route inside
    // the G10 "every mutating route calls assertWritable" invariant).
    assertWritable(await getViewContext());

    const parsed = postSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });
    }
    const target = normalizeEmail(parsed.data.email);
    if (!target || target === admin) {
      return NextResponse.json(
        { ok: false, error: "target must be another user" },
        { status: 400 },
      );
    }

    // Target Users row must exist (invalid email shapes also land here — the
    // keyed lookup fails closed to null).
    const row = await getUserRow(target);
    if (!row) {
      return NextResponse.json({ ok: false, error: "user not found" }, { status: 404 });
    }

    // Audit write fails ⇒ entry denied (PRD §5.5) — never set the cookie.
    try {
      await logAdminAudit("view_as_enter", admin, target);
    } catch (e) {
      console.error("view-as: enter audit write failed — entry denied", e);
      return NextResponse.json({ ok: false, error: "audit unavailable" }, { status: 503 });
    }

    const res = NextResponse.json({ ok: true, email: target });
    res.cookies.set(VIEWAS_COOKIE, createViewAsToken(admin, target), {
      ...COOKIE_OPTS,
      maxAge: VIEWAS_MAX_AGE_S,
    });
    return res;
  } catch (e) {
    return handleAuthError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { email: admin } = await requireAdminApi();
    assertSameOrigin(req);
    // NO assertWritable here by design: exiting view-as must always work.

    const payload = verifyViewAsToken(req.cookies.get(VIEWAS_COOKIE)?.value);
    try {
      await logAdminAudit("view_as_exit", admin, payload?.target ?? "");
    } catch (e) {
      // Best-effort: the exit row is bounded by the enter row + 1h TTL anyway.
      console.error("view-as: exit audit write failed (cookie cleared regardless)", e);
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(VIEWAS_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
    return res;
  } catch (e) {
    return handleAuthError(e);
  }
}
