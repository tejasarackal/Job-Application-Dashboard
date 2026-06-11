// /api/targets/user — per-user target-company editor backend (PRD-multi-user
// §6.4, §7.6, D8, C3). Full-replace PUT for the client; the server diffs the
// desired state against the existing sparse UserTargets deviation rows via
// lib/targets.ts#diffTargets and applies only creates/deletes.
//
// Invariants:
// - Rows are owner-stamped server-side (UserTargets is user-scoped, not an
//   OwnedTableKey, so withOwner() doesn't cover it — we stamp
//   FIELDS.userTargets.userEmail explicitly; client-supplied owners never exist
//   in the schema).
// - `H1B Verified` is NEVER written here (admin-set only, C3). diffTargets
//   keeps existing rows that match on (companyKey, status) — a verified custom
//   is never delete-and-recreated, so the flag survives every save.
// - Mode changes are one Users PATCH (`Default Targets`); out-of-mode
//   deviations persist inert (R-5) — diffTargets only governs in-mode rows.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireUserApi,
  getViewContext,
  assertWritable,
  assertSameOrigin,
  handleAuthError,
  AuthError,
} from "@/lib/session";
import {
  listTargets,
  listUserTargets,
  createRecords,
  deleteRecords,
  primaryBase,
  TABLES,
  FIELDS,
  type UserTargetRow,
} from "@/lib/airtable";
import { getUserRow, createUserRow, updateUserRow } from "@/lib/users";
import {
  effectiveTargets,
  diffTargets,
  type MasterCompany,
  type TargetDeviation,
  type DefaultTargetsMode,
  type TargetsPutInput,
} from "@/lib/targets";
import { normalizeCompany } from "@/lib/workflows/filters";
import type { TargetCompany } from "@/lib/types";

export const dynamic = "force-dynamic";

// ── Schema (PRD §6.4 contract; STRICT allowlist like /api/profile) ───────────

const putSchema = z.strictObject({
  defaultMode: z.enum(["h1b_all", "none"]),
  selections: z
    .array(
      z.strictObject({
        companyKey: z.string().trim().min(1, "Company key is required.").max(120, "Company key is too long."),
        enabled: z.boolean(),
      }),
    )
    .max(500, "Up to 500 selections."),
  custom: z
    .array(
      z.strictObject({
        name: z
          .string()
          .trim()
          .min(2, "Company names need at least 2 characters.")
          .max(80, "Keep company names under 80 characters."),
        // Optional; empty string means "no URL" (form clears).
        careersUrl: z
          .union([
            z.literal(""),
            z.string().trim().max(500, "Keep the careers URL under 500 characters.").pipe(z.url("Enter a valid URL.")),
          ])
          .optional(),
      }),
    )
    .max(50, "Up to 50 custom companies."), // PRD C3 cap
});

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!out[field]) out[field] = issue.message;
  }
  return out;
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

/** Live H1B master → MasterCompany keyed by filters.ts#normalizeCompany.
 *  First row wins on duplicate keys (mirrors effectiveTargets' seen-set). */
function mapMaster(targets: TargetCompany[]): MasterCompany[] {
  const out: MasterCompany[] = [];
  const seen = new Set<string>();
  for (const t of targets) {
    const key = normalizeCompany(t.employer);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      name: t.employer,
      sector: t.sector,
      ats: t.ats,
      bayArea: Boolean(t.bayArea),
      careersUrl: t.careersUrl,
    });
  }
  return out;
}

/** Airtable deviation rows → the exact diffTargets/effectiveTargets input
 *  shape (rows with an unknown status are dropped, never guessed). */
function mapDeviations(rows: UserTargetRow[]): TargetDeviation[] {
  return rows
    .filter((d) => d.status === "excluded" || d.status === "added")
    .map((d) => ({
      id: d.id,
      companyKey: d.companyKey,
      status: d.status as "excluded" | "added",
      companyName: d.companyName,
      careersUrl: d.careersUrl,
      h1bVerified: d.h1bVerified,
    }));
}

function currentMode(defaultTargets: string | null | undefined): DefaultTargetsMode {
  return defaultTargets === "none" ? "none" : "h1b_all";
}

// ── GET — master + deviations + effective counts ─────────────────────────────

export async function GET() {
  try {
    const session = await requireUserApi();
    const [targets, deviationRows, row] = await Promise.all([
      listTargets(),
      listUserTargets(session.email),
      getUserRow(session.email),
    ]);
    const master = mapMaster(targets);
    const deviations = mapDeviations(deviationRows);
    const mode = currentMode(row?.defaultTargets);
    const { counts } = effectiveTargets(master, mode, deviations);
    return NextResponse.json({
      ok: true,
      mode,
      master: master.map((m) => ({
        key: m.key,
        name: m.name,
        sector: m.sector,
        ats: m.ats,
        bayArea: m.bayArea,
      })),
      deviations,
      effective: { counts },
    });
  } catch (e) {
    if (e instanceof AuthError) return handleAuthError(e);
    console.error("targets GET failed", e);
    return NextResponse.json({ ok: false, error: "targets read failed" }, { status: 500 });
  }
}

// ── PUT — full-replace from the editor, server-diffed to sparse deviations ──

export async function PUT(req: NextRequest) {
  try {
    const session = await requireUserApi();
    assertSameOrigin(req);
    assertWritable(await getViewContext());

    const json = await req.json().catch(() => null);
    const parsed = putSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, fieldErrors: zodFieldErrors(parsed.error) }, { status: 422 });
    }
    const input: TargetsPutInput = {
      defaultMode: parsed.data.defaultMode,
      selections: parsed.data.selections,
      custom: parsed.data.custom.map((c) => ({
        name: c.name,
        ...(c.careersUrl ? { careersUrl: c.careersUrl } : {}),
      })),
    };

    // Fresh master + existing deviations (listUserTargets is no-store) — the
    // diff must never run against a 30s-stale snapshot.
    const [targets, existingRows, row] = await Promise.all([
      listTargets(),
      listUserTargets(session.email),
      getUserRow(session.email),
    ]);
    const master = mapMaster(targets);
    const existing = mapDeviations(existingRows);

    const diff = diffTargets(input, master, existing);

    // Creates first, then stale deletes (a failure between the two leaves
    // duplicates, which effectiveTargets dedups and the next save's diff
    // removes — never lost curation).
    if (diff.create.length > 0) {
      const f = FIELDS.userTargets;
      await createRecords(
        TABLES.userTargets,
        primaryBase(),
        diff.create.map((d) => ({
          // Explicit owner stamp (userTargets is outside withOwner's
          // OwnedTableKey set). session.email is already normalized.
          [f.userEmail]: session.email,
          [f.companyKey]: d.companyKey,
          [f.status]: d.status,
          ...(d.companyName ? { [f.companyName]: d.companyName } : {}),
          ...(d.careersUrl ? { [f.careersUrl]: d.careersUrl } : {}),
          // f.h1bVerified deliberately never written — admin-set only (C3).
        })),
      );
    }
    if (diff.delete.length > 0) {
      await deleteRecords(TABLES.userTargets, primaryBase(), diff.delete);
    }

    // Persist the mode flag only when it actually changed (one Users PATCH —
    // the R-5 opt-out path is exactly this write plus zero target rows).
    if (diff.mode !== currentMode(row?.defaultTargets)) {
      if (row) {
        await updateUserRow(session.email, { defaultTargets: diff.mode });
      } else {
        // No Users row (owner pre-migrate, or a member whose signIn-time row
        // create failed). The session passed requireUserApi, so "active" can
        // never resurrect a disabled account — a disabled member never gets here.
        await createUserRow({
          email: session.email,
          accountStatus: "active",
          onboardingStatus: "pending",
          defaultTargets: diff.mode,
        });
      }
    }

    // Recompute from a fresh read so the response counts reflect what is
    // actually stored, not what we believe we wrote.
    const afterRows = await listUserTargets(session.email);
    const { counts } = effectiveTargets(master, diff.mode, mapDeviations(afterRows));

    return NextResponse.json({ ok: true, counts });
  } catch (e) {
    if (e instanceof AuthError) return handleAuthError(e);
    console.error("targets PUT failed", e);
    return NextResponse.json({ ok: false, error: "targets save failed" }, { status: 500 });
  }
}
