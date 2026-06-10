import { NextRequest, NextResponse } from "next/server";
import { listJobListings, updateRecords, TABLES, FIELDS, primaryBase } from "@/lib/airtable";
import { roleKey } from "@/lib/workflows/filters";

export const dynamic = "force-dynamic";

// The statuses a user can set from the listings UI (e.g. triage new → skipped).
const STATUSES = new Set(["new", "queued", "approved", "applied", "skipped", "review_pending", "expired"]);
// Sibling postings of the same role still in one of these states get collapsed when
// the user applies, so the role stops reappearing in New across its other variants.
const PRE_APPLY = new Set(["new", "queued", "approved", "review_pending"]);

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

    // On apply, collapse same-role sibling variants (the same job posted on another
    // board / under a new req id) out of New → expired. Mirrors the scrape-time
    // suppression for the manual path; same-day duplicates the scrape can't see.
    let collapsed = 0;
    if (status === "applied") {
      const listings = await listJobListings({ fresh: true });
      const self = listings.find((l) => l.id === params.id);
      if (self) {
        const rk = roleKey(self.company, self.title);
        const siblings = listings.filter(
          (l) => l.id !== params.id && l.status && PRE_APPLY.has(l.status) && roleKey(l.company, l.title) === rk,
        );
        if (siblings.length) {
          await updateRecords(
            TABLES.jobListings,
            primaryBase(),
            siblings.map((l) => ({ id: l.id, fields: { [FIELDS.jobListings.status]: "expired" } })),
          );
          collapsed = siblings.length;
        }
      }
    }
    return NextResponse.json({ ok: true, id: params.id, status, collapsed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
