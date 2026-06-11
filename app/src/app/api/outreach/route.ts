// POST /api/outreach — member manual outreach create (PRD-multi-user §5.3
// session+onb row, §7.7, tracker 2.7). Writes the Outreach table (primary
// base — the MANUAL tracker; the Leads table stays the engine's automated
// pipeline). Owner stamped server-side. Channel/status enums are the EXISTING
// single-select options — typecast can never mint a new option.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createRecords, withOwner, TABLES, FIELDS, primaryBase } from "@/lib/airtable";
import {
  requireUserApi,
  getViewContext,
  assertWritable,
  assertSameOrigin,
  handleAuthError,
  AuthError,
} from "@/lib/session";

export const dynamic = "force-dynamic";

// Existing Outreach.Channel / Outreach.Status options (lib/utils.ts palette).
const CHANNELS = ["Email", "LinkedIn", "Email+LinkedIn", "Phone"] as const;
const STATUSES = ["Drafted", "Sent", "Contacted", "Replied", "No Reply", "Interviewing", "Rejected"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.strictObject({
  company: z
    .string()
    .trim()
    .min(2, "Company needs at least 2 characters.")
    .max(80, "Keep the company under 80 characters."),
  contactName: z
    .string()
    .trim()
    .min(2, "Contact name needs at least 2 characters.")
    .max(80, "Keep the contact name under 80 characters."),
  title: z.union([z.literal(""), z.string().trim().max(100, "Keep the title under 100 characters.")]).optional(),
  email: z
    .union([z.literal(""), z.string().trim().max(254).pipe(z.email("Enter a valid email address."))])
    .optional(),
  linkedin: z
    .union([z.literal(""), z.string().trim().max(2048).pipe(z.url("Enter a valid URL."))])
    .optional(),
  channel: z.enum(CHANNELS).optional(), // default "Email"
  status: z.enum(STATUSES).optional(), // default "Contacted"
  date: z.union([z.literal(""), z.string().regex(DATE_RE, "Use the date picker.")]).optional(),
});

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!out[field]) out[field] = issue.message;
  }
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireUserApi();
    assertSameOrigin(req);
    assertWritable(await getViewContext()); // view-as is read-only by construction (D7)

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, fieldErrors: zodFieldErrors(parsed.error) }, { status: 422 });
    }
    const b = parsed.data;

    const f = FIELDS.outreach;
    const fields: Record<string, unknown> = {
      [f.company]: b.company,
      [f.contactName]: b.contactName,
      [f.channel]: b.channel ?? "Email",
      [f.status]: b.status ?? "Contacted",
      [f.date]: b.date || new Date().toISOString().slice(0, 10),
    };
    if (b.title) fields[f.title] = b.title;
    if (b.email) fields[f.email] = b.email;
    if (b.linkedin) fields[f.linkedin] = b.linkedin;

    const [rec] = await createRecords(TABLES.outreach, primaryBase(), [
      withOwner("outreach", fields, session.email),
    ]);
    return NextResponse.json({ ok: true, id: rec.id });
  } catch (e) {
    if (e instanceof AuthError) return handleAuthError(e);
    console.error("api/outreach POST:", e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
