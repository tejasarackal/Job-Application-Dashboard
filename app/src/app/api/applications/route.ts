// POST /api/applications — member manual application create (PRD-multi-user
// §5.3 session+onb row, §7.7, tracker 2.7). Owner stamped server-side.
// Status values are the EXISTING Applications.Status options only (the same
// set syncApplications writes) — typecast can never mint a new option.

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

// Existing Applications.Status options (see lib/utils.ts palette +
// syncApplications.ts STATUS_RANK). "submitted" is the earliest stage.
const STATUSES = ["submitted", "interviewing", "offered", "rejected", "withdrawn", "ghosted"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.strictObject({
  company: z
    .string()
    .trim()
    .min(2, "Company needs at least 2 characters.")
    .max(80, "Keep the company under 80 characters."),
  jobTitle: z
    .string()
    .trim()
    .min(2, "Job title needs at least 2 characters.")
    .max(120, "Keep the job title under 120 characters."),
  jobUrl: z
    .union([z.literal(""), z.string().trim().max(2048).pipe(z.url("Enter a valid URL."))])
    .optional(),
  status: z.enum(STATUSES).optional(), // default "submitted"
  submittedAt: z.union([z.literal(""), z.string().regex(DATE_RE, "Use the date picker.")]).optional(),
});

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!out[field]) out[field] = issue.message;
  }
  return out;
}

// Mirrors syncApplications.ts#slug for the Application ID primary field.
function slug(s: string): string {
  return (s || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "x";
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
    const submittedAt = b.submittedAt || new Date().toISOString().slice(0, 10);
    const status = b.status ?? "submitted";

    const f = FIELDS.applications;
    const fields: Record<string, unknown> = {
      // Same id convention as the Gmail sync writer (primary field never blank).
      [f.applicationId]: `${slug(b.company)}-${slug(b.jobTitle)}-${submittedAt.replace(/-/g, "")}`,
      [f.company]: b.company,
      [f.jobTitle]: b.jobTitle,
      [f.status]: status,
      [f.submittedAt]: submittedAt,
    };
    if (b.jobUrl) fields[f.jobUrl] = b.jobUrl;

    const [rec] = await createRecords(TABLES.applications, primaryBase(), [
      withOwner("applications", fields, session.email),
    ]);
    return NextResponse.json({ ok: true, id: rec.id });
  } catch (e) {
    if (e instanceof AuthError) return handleAuthError(e);
    console.error("api/applications POST:", e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
