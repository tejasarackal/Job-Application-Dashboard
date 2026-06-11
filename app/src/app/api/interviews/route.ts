// POST /api/interviews — member manual interview create (PRD-multi-user §5.3
// session+onb row, §7.7, tracker 2.7). Owner stamped server-side. Stage and
// status enums mirror the EXISTING single-select options syncInterviews writes
// (STAGES / status classification) — typecast can never mint a new option.

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

// Pinned to lib/workflows/syncInterviews.ts#STAGES (not imported — the route
// must not pull the engine/Gmail graph into its bundle; a values change there
// is a deliberate schema event, not a drive-by).
const STAGES = [
  "Recruiter Screen",
  "Technical Screen",
  "Take Home",
  "Hiring Manager",
  "System Design",
  "Behavioral",
  "Onsite / Final",
  "Offer",
  "Interview",
] as const;

// Existing Interviews.Status options (syncInterviews classification set).
const STATUSES = ["Scheduled", "Awaiting Feedback", "Passed", "Rejected", "Cancelled", "Completed"] as const;

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/; // date or datetime-local

const schema = z.strictObject({
  company: z
    .string()
    .trim()
    .min(2, "Company needs at least 2 characters.")
    .max(80, "Keep the company under 80 characters."),
  role: z
    .string()
    .trim()
    .min(2, "Role needs at least 2 characters.")
    .max(120, "Keep the role under 120 characters."),
  stage: z.enum(STAGES).optional(),
  status: z.enum(STATUSES).optional(), // default "Scheduled"
  scheduledAt: z.union([z.literal(""), z.string().regex(DATETIME_RE, "Use the date picker.")]).optional(),
  interviewer: z.union([z.literal(""), z.string().trim().max(80, "Keep the interviewer under 80 characters.")]).optional(),
  notes: z.union([z.literal(""), z.string().trim().max(2000, "Keep notes under 2,000 characters.")]).optional(),
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
    const stage = b.stage ?? "Interview"; // generic fallback, same as the sync writer
    const status = b.status ?? "Scheduled";

    const f = FIELDS.interviews;
    const fields: Record<string, unknown> = {
      // Same label convention as syncInterviews (primary field never blank).
      [f.label]: `${b.company} — ${stage}`,
      [f.company]: b.company,
      [f.role]: b.role,
      [f.stage]: stage,
      [f.status]: status,
      [f.lastUpdated]: new Date().toISOString().slice(0, 10),
    };
    if (b.scheduledAt) fields[f.scheduledAt] = b.scheduledAt;
    if (b.interviewer) fields[f.interviewer] = b.interviewer;
    if (b.notes) fields[f.notes] = b.notes;

    const [rec] = await createRecords(TABLES.interviews, primaryBase(), [
      withOwner("interviews", fields, session.email),
    ]);
    return NextResponse.json({ ok: true, id: rec.id });
  } catch (e) {
    if (e instanceof AuthError) return handleAuthError(e);
    console.error("api/interviews POST:", e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
