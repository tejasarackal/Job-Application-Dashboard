// POST /api/admin/migrate — idempotent, chunked ownership backfill
// (PRD §6.6, D14). Admin-only + same-origin.
//
// Cursor design: `{ table, counts }` where `table` is the next step (an owned
// table key, or "finalize") and `counts` accumulates per-table patched totals
// across invocations so the final `migrate_run` audit row can carry them.
// Each invocation works ONE step inside a ~45s budget:
//   - table step: page blank-owner record ids (limit 100) → PATCH `User Email`
//     = OWNER_EMAIL in ≤10 batches → repeat until the table drains or the
//     budget runs out. Drained → cursor advances; out of budget → same table.
//   - finalize step (after leads): upsert the owner's Users row (never
//     overwriting a non-empty Preferences) + audit `migrate_run`.
// Blank-only predicate + upsert ⇒ safe to re-run any number of times.

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
import {
  listUnstampedRecordIds,
  updateRecords,
  createRecords,
  logAdminAudit,
  ownedBase,
  usersTable,
  primaryBase,
  TABLES,
  FIELDS,
  type OwnedTableKey,
} from "@/lib/airtable";
import { tejasDefaults, serializePrefs } from "@/lib/prefs";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby cap; we self-budget well inside it

const BUDGET_MS = 45_000;
const PAGE_LIMIT = 100;
const FINALIZE = "finalize";

// Primary base first, then the leads base (PRD §6.6 step 3 order).
const TABLE_ORDER: OwnedTableKey[] = [
  "jobListings",
  "applications",
  "interviews",
  "outreach",
  "workflowRuns",
  "leads",
];

const bodySchema = z.object({
  cursor: z
    .object({
      table: z.string(),
      counts: z.record(z.string(), z.number()),
    })
    .nullish(),
});

export async function POST(req: NextRequest) {
  try {
    const { email: admin } = await requireAdminApi();
    assertSameOrigin(req);
    assertWritable(await getViewContext()); // never under view-as (D7)

    const owner = normalizeEmail(process.env.OWNER_EMAIL ?? "");
    if (!owner) {
      // requireAdminApi implies OWNER_EMAIL is set, but stay fail-closed.
      return NextResponse.json({ ok: false, error: "OWNER_EMAIL unset" }, { status: 503 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid cursor" }, { status: 400 });
    }
    const cursor = parsed.data.cursor ?? null;
    const step = cursor?.table ?? TABLE_ORDER[0];
    const counts: Record<string, number> = { ...(cursor?.counts ?? {}) };

    // ── Finalize step: owner Users-row upsert + migrate_run audit ────────────
    if (step === FINALIZE) {
      await upsertOwnerUserRow(owner);
      await logAdminAudit("migrate_run", admin, "", JSON.stringify(counts));
      return NextResponse.json({
        ok: true,
        table: FINALIZE,
        patched: 0,
        scanned: 0,
        more: false,
        cursor: null,
        counts,
      });
    }

    // ── Table step ────────────────────────────────────────────────────────────
    const idx = TABLE_ORDER.indexOf(step as OwnedTableKey);
    if (idx === -1) {
      return NextResponse.json({ ok: false, error: `unknown table ${step}` }, { status: 400 });
    }
    const tableKey = TABLE_ORDER[idx];
    const baseId = ownedBase(tableKey);
    const ownerField = FIELDS[tableKey].userEmail;

    const start = Date.now();
    let patched = 0;
    let scanned = 0;
    let drained = false;

    while (Date.now() - start < BUDGET_MS) {
      const ids = await listUnstampedRecordIds(tableKey, baseId, PAGE_LIMIT);
      scanned += ids.length;
      if (ids.length === 0) {
        drained = true;
        break;
      }
      for (let i = 0; i < ids.length; i += 10) {
        if (Date.now() - start >= BUDGET_MS) break;
        const batch = ids.slice(i, i + 10);
        await updateRecords(
          TABLES[tableKey],
          baseId,
          batch.map((id) => ({ id, fields: { [ownerField]: owner } })),
        );
        patched += batch.length;
      }
    }

    counts[tableKey] = (counts[tableKey] ?? 0) + patched;
    const nextTable = drained ? TABLE_ORDER[idx + 1] ?? FINALIZE : tableKey;

    return NextResponse.json({
      ok: true,
      table: tableKey,
      patched,
      scanned,
      more: true, // there is ALWAYS a next step until finalize returns false
      cursor: { table: nextTable, counts },
    });
  } catch (e) {
    return handleAuthError(e);
  }
}

// ── Owner Users-row upsert (PRD §6.6 step 3, final chunk) ─────────────────────

// Single-select values come back as strings via REST; tolerate object shape.
function valueName(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "name" in v) return String((v as { name: unknown }).name ?? "");
  return String(v);
}

function isBlank(v: unknown): boolean {
  return valueName(v).trim() === "";
}

/** Raw keyed read of one Users record with field-ID keys — the typed UserRow
 *  doesn't carry Preferences/Default Targets, and "never overwrite a non-empty
 *  Preferences" needs the real cell value. (No helpers added to lib/users.ts.) */
async function getUsersRecordById(
  id: string,
): Promise<{ id: string; fields: Record<string, unknown> }> {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error("Airtable not configured");
  const url = `https://api.airtable.com/v0/${primaryBase()}/${usersTable()}/${id}?returnFieldsByFieldId=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Airtable users record ${res.status} ${await res.text()}`);
  return (await res.json()) as { id: string; fields: Record<string, unknown> };
}

async function upsertOwnerUserRow(owner: string): Promise<void> {
  const f = FIELDS.users;
  const seed: Record<string, unknown> = {
    [f.email]: owner,
    [f.name]: "Tejas Arackal",
    [f.accountStatus]: "active",
    [f.onboardingStatus]: "complete",
    [f.defaultTargets]: "h1b_all",
    [f.preferences]: serializePrefs(tejasDefaults()),
  };

  const row = await getUserRow(owner);
  if (!row) {
    await createRecords(usersTable(), primaryBase(), [seed]);
    return;
  }

  // Present: PATCH only the missing fields — never overwrite a non-empty value
  // (Preferences especially: edits on /profile must survive a migrate re-run).
  const rec = await getUsersRecordById(row.id);
  const fields: Record<string, unknown> = {};
  for (const key of [f.name, f.accountStatus, f.onboardingStatus, f.defaultTargets, f.preferences]) {
    if (isBlank(rec.fields[key])) fields[key] = seed[key];
  }
  if (Object.keys(fields).length > 0) {
    await updateRecords(usersTable(), primaryBase(), [{ id: row.id, fields }]);
  }
}
