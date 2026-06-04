import { NextRequest, NextResponse } from "next/server";
import { updateRecords, TABLES, FIELDS, primaryBase } from "@/lib/airtable";

export const dynamic = "force-dynamic";

// The statuses a user can set from the listings UI (e.g. triage new → skipped).
const STATUSES = new Set(["new", "queued", "approved", "applied", "skipped", "review_pending"]);

// POST /api/listings/{id}  body { status } — update one Job_Listings row's status.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { status } = (await req.json().catch(() => ({}))) as { status?: string };
  if (!status || !STATUSES.has(status)) {
    return NextResponse.json({ ok: false, error: "valid status required" }, { status: 400 });
  }
  try {
    await updateRecords(TABLES.jobListings, primaryBase(), [
      { id: params.id, fields: { [FIELDS.jobListings.status]: status } },
    ]);
    return NextResponse.json({ ok: true, id: params.id, status });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
