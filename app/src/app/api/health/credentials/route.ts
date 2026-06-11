import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkCredentials, shapeDetailHealth, shapePublicHealth } from "@/lib/health";
import { requireAdminApi } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/health/credentials — health split per PRD D13.
//
// Public (no auth): boolean-only `{ ok, checks: { airtable, gmail, anthropic,
// apify, auth } }`, always 200, Cache-Control: no-store. No email addresses,
// no upstream error strings — the uptime-ping use case at minimal disclosure.
//
// Detail (`?detail=1`): the full per-service ok/detail payload (207 multi-status
// when any configured service fails). Gated behind EITHER `Authorization:
// Bearer <CRON_SECRET>` (timing-safe compare, same pattern as the cron route)
// OR an admin session (`requireAdminApi`). Both fail → 403, no data bytes.

function bearerMatchesCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // unset → this principal simply doesn't exist
  const presented = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

export async function GET(req: NextRequest) {
  const wantDetail = new URL(req.url).searchParams.get("detail") === "1";

  if (!wantDetail) {
    const body = shapePublicHealth(await checkCredentials());
    return NextResponse.json(body, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Gated detail: CRON_SECRET bearer OR admin session — fall through to 403.
  let allowed = bearerMatchesCronSecret(req);
  if (!allowed) {
    try {
      await requireAdminApi();
      allowed = true;
    } catch {
      // not an admin session either — fall through
    }
  }
  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = shapeDetailHealth(await checkCredentials());
  return NextResponse.json(body, {
    status: body.ok ? 200 : 207,
    headers: { "Cache-Control": "no-store" },
  });
}
