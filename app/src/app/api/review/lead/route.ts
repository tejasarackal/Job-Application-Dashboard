import { NextRequest, NextResponse } from "next/server";
import { updateRecords, TABLES, FIELDS, leadsBase } from "@/lib/airtable";

export const dynamic = "force-dynamic";

// Human gate B2 — lead approval. Pure Airtable writes, no external calls.
// POST body: { id, action: "approve" | "reject" | "edit", fields?: { email?, title?, linkedin? } }
export async function POST(req: NextRequest) {
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

  try {
    await updateRecords(TABLES.leads, leadsBase(), [{ id: body.id, fields }]);
    return NextResponse.json({ ok: true, id: body.id, action: body.action });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
