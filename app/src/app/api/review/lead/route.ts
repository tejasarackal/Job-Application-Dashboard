import { NextRequest, NextResponse } from "next/server";
import {
  assertOwnership,
  updateRecords,
  OwnershipError,
  TABLES,
  FIELDS,
  leadsBase,
} from "@/lib/airtable";
import {
  requireUserApi,
  getViewContext,
  assertWritable,
  assertSameOrigin,
  handleAuthError,
  AuthError,
} from "@/lib/session";

export const dynamic = "force-dynamic";

// Human gate B2 — lead approval. Pure Airtable writes, no external calls.
// Gate (PRD §5.3 + Phase 3b): signed-in + same-origin + not-view-as + ownership
// proof on the lead (session email, never effectiveEmail) — a member can only
// approve their OWN leads.
// POST body: { id, action: "approve" | "reject" | "edit", fields?: { email?, title?, linkedin? } }
export async function POST(req: NextRequest) {
  try {
    const session = await requireUserApi();
    assertSameOrigin(req);
    assertWritable(await getViewContext()); // never under view-as (D7)

    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      action?: "approve" | "reject" | "edit";
      fields?: { email?: string; title?: string; linkedin?: string };
    };
    if (!body.id || !body.action) {
      return NextResponse.json({ ok: false, error: "id and action are required" }, { status: 400 });
    }

    const fields: Record<string, unknown> = {};
    if (body.action === "approve") fields[FIELDS.leads.status] = "approved";
    else if (body.action === "reject") fields[FIELDS.leads.status] = "rejected";
    else if (body.action === "edit") {
      if (body.fields?.email) fields[FIELDS.leads.email] = body.fields.email;
      if (body.fields?.title) fields[FIELDS.leads.title] = body.fields.title;
      if (body.fields?.linkedin) fields[FIELDS.leads.linkedin] = body.fields.linkedin;
    }
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });
    }

    // Ownership proof before the write (PRD D5) — session email, never effectiveEmail.
    await assertOwnership(TABLES.leads, leadsBase(), session.email, [body.id]);

    await updateRecords(TABLES.leads, leadsBase(), [{ id: body.id, fields }]);
    return NextResponse.json({ ok: true, id: body.id, action: body.action });
  } catch (e) {
    if (e instanceof OwnershipError) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    if (e instanceof AuthError) return handleAuthError(e);
    console.error("api/review/lead:", e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
