import { NextRequest, NextResponse } from "next/server";
import {
  assertOwnership,
  listLeads,
  updateRecords,
  OwnershipError,
  TABLES,
  FIELDS,
  leadsBase,
} from "@/lib/airtable";
import {
  requireUserApi,
  getViewContext,
  assertWritable,
  assertSameOrigin,
  handleAuthError,
  AuthError,
} from "@/lib/session";
import { createDraft, ensureLabel, labelMessage, getAccessToken } from "@/lib/workflows/gmail";
import { loadUserKnowledge } from "@/lib/workflows/knowledge";
import { getGmailRefreshToken } from "@/lib/users";
import { isOwner } from "@/lib/auth-shared";

export const dynamic = "force-dynamic";

const LABEL = "Job Outreach";

// Human gate B3 — draft review. This is the ONLY place a Gmail draft is created,
// and only on explicit approval. There is no send path anywhere.
// Gate (PRD §5.3 + Phase 3b): signed-in + same-origin + not-view-as (D7/CR-S17)
// + ownership proof on the lead. The draft is created in the ACTOR's OWN mailbox
// (their decrypted Gmail token; owner falls back to the env token) — a member
// approval can never write into the owner's mailbox.
// POST body: { id, action: "approve" | "reject" | "edit", subject?, body? }
export async function POST(req: NextRequest) {
  try {
    const session = await requireUserApi();
    assertSameOrigin(req);
    assertWritable(await getViewContext()); // never under view-as (D7/CR-S17)

    const req2 = (await req.json().catch(() => ({}))) as {
      id?: string;
      action?: "approve" | "reject" | "edit";
      subject?: string;
      body?: string;
    };
    if (!req2.id || !req2.action) {
      return NextResponse.json({ ok: false, error: "id and action are required" }, { status: 400 });
    }

    // Ownership proof before any write (PRD D5) — session email, never effectiveEmail.
    await assertOwnership(TABLES.leads, leadsBase(), session.email, [req2.id]);

    const lead = (await listLeads(session.email, { fresh: true })).find((l) => l.id === req2.id);
    if (!lead) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

    const subject = (req2.subject ?? lead.emailSubject ?? "").trim();
    const bodyText = (req2.body ?? lead.emailBody ?? "").trim();

    if (req2.action === "reject") {
      await updateRecords(TABLES.leads, leadsBase(), [{ id: lead.id, fields: { [FIELDS.leads.status]: "rejected" } }]);
      return NextResponse.json({ ok: true, action: "reject", id: lead.id });
    }

    if (req2.action === "edit") {
      await updateRecords(TABLES.leads, leadsBase(), [
        {
          id: lead.id,
          fields: { [FIELDS.leads.emailSubject]: subject, [FIELDS.leads.emailBody]: bodyText },
        },
      ]);
      return NextResponse.json({ ok: true, action: "edit", id: lead.id });
    }

    // approve → create the Gmail draft (never send), label it, promote to draft.
    if (!subject || !bodyText) {
      return NextResponse.json({ ok: false, error: "subject and body required to approve" }, { status: 400 });
    }
    // Signer name = the ACTOR's display name (owner → "Tejas"), never hardcoded.
    const { name: senderName } = await loadUserKnowledge(session.email);
    const signer = senderName.split(" ")[0] || senderName || "Me";
    const firstName = lead.contactName?.split(" ")[0] || "there";
    const fullBody = `Hello ${firstName},\n\n${bodyText}\n\nBest,\n${signer}`;

    let gmail: { draftId: string; messageId: string } | null = null;
    if (lead.email) {
      // Create the draft in the ACTOR's OWN mailbox. Member → their decrypted
      // token (must be connected); owner → stored token or env fallback.
      let accessToken: string | undefined;
      try {
        const stored = await getGmailRefreshToken(session.email);
        if (stored) accessToken = await getAccessToken(stored);
        else if (isOwner(session.email)) accessToken = await getAccessToken(); // env
        else {
          return NextResponse.json(
            { ok: false, error: "Connect your Gmail first (Profile → Connect Gmail) to draft to an email contact.", code: "gmail_not_connected" },
            { status: 409 },
          );
        }
      } catch {
        return NextResponse.json(
          { ok: false, error: "Your Gmail connection needs renewing — reconnect it in Profile, then try again.", code: "gmail_auth_failed" },
          { status: 409 },
        );
      }
      const draft = await createDraft(lead.email, subject, fullBody, accessToken);
      const labelId = await ensureLabel(LABEL, accessToken);
      await labelMessage(draft.messageId, labelId, accessToken);
      gmail = { draftId: draft.draftId, messageId: draft.messageId };
    }

    await updateRecords(TABLES.leads, leadsBase(), [
      {
        id: lead.id,
        fields: {
          [FIELDS.leads.status]: "draft",
          [FIELDS.leads.emailSubject]: subject,
          [FIELDS.leads.emailBody]: bodyText,
          [FIELDS.leads.outreachDate]: new Date().toISOString().slice(0, 10),
        },
      },
    ]);

    return NextResponse.json({
      ok: true,
      action: "approve",
      id: lead.id,
      gmailDraft: gmail,
      note: lead.email ? "Gmail draft created + labeled (not sent)" : "no email — LinkedIn outreach is manual; status set to draft",
    });
  } catch (e) {
    if (e instanceof OwnershipError) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    if (e instanceof AuthError) return handleAuthError(e);
    console.error("api/review/draft:", e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
