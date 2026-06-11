// POST /api/listings — member manual listing create (PRD-multi-user §5.3
// session+onb row, §7.7, tracker 2.7). Owner stamped server-side via
// withOwner; compute-on-save match % (D10) against the caller's own prefs.
// No GET here — reads stay on the owner-filtered list functions.

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
import { getUserPrefs } from "@/lib/prefs";
import { scoringPrefsFor, canComputeMatch } from "@/lib/scoring";
import { matchScore, canonicalJobKey, canonicalUrl } from "@/lib/workflows/filters";

export const dynamic = "force-dynamic";

// ── Schema (strict — unknown keys rejected; statuses/board are never client-
// supplied, so typecast can't mint new single-select options) ────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.strictObject({
  title: z
    .string()
    .trim()
    .min(2, "Title needs at least 2 characters.")
    .max(120, "Keep the title under 120 characters."),
  company: z
    .string()
    .trim()
    .min(2, "Company needs at least 2 characters.")
    .max(80, "Keep the company under 80 characters."),
  url: z
    .union([z.literal(""), z.string().trim().max(2048).pipe(z.url("Enter a valid URL."))])
    .optional(),
  location: z.union([z.literal(""), z.string().trim().max(120, "Keep the location under 120 characters.")]).optional(),
  remote: z.boolean().optional(),
  postedAt: z.union([z.literal(""), z.string().regex(DATE_RE, "Use the date picker.")]).optional(),
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
    const url = b.url || undefined;
    const location = b.location || undefined;
    const postedAt = b.postedAt || undefined;

    const f = FIELDS.jobListings;
    const fields: Record<string, unknown> = {
      [f.title]: b.title,
      [f.company]: b.company,
      // Board derives from the URL exactly like the scraper (canonicalJobKey
      // only returns existing options); manual/no-URL entries file as "Other".
      [f.board]: url ? canonicalJobKey(url).board : "Other",
      [f.status]: "new",
      // "Saved at" — keeps manual rows in the same newest-first sort scraped rows use.
      [f.scrapedAt]: new Date().toISOString().slice(0, 10),
    };
    if (url) fields[f.url] = canonicalUrl(url);
    if (location) fields[f.location] = location;
    if (typeof b.remote === "boolean") fields[f.remote] = b.remote;
    if (postedAt) fields[f.postedAt] = postedAt;

    // Compute-on-save match % (D10): the member's own prefs — never the
    // owner's lists; the owner keeps OWNER_PREFS (tiered path). Incomputable
    // (no keywords, no tier basis) → field omitted, renders "—".
    const prefs = await getUserPrefs(session.email);
    const scoringPrefs = scoringPrefsFor(session.email, prefs);
    if (canComputeMatch(scoringPrefs)) {
      const pct = matchScore({ title: b.title, location, remote: b.remote, postedAt }, scoringPrefs);
      fields[f.matchPct] = pct / 100; // Airtable percent stores a FRACTION
    }

    const [rec] = await createRecords(TABLES.jobListings, primaryBase(), [
      withOwner("jobListings", fields, session.email),
    ]);
    return NextResponse.json({ ok: true, id: rec.id });
  } catch (e) {
    if (e instanceof AuthError) return handleAuthError(e);
    console.error("api/listings POST:", e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
