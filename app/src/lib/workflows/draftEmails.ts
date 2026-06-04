// B3 — Email drafting → Leads (Status=draft_pending). Port of
// _instructions_emails.md Step 2. The LLM drafts a subject + 3-paragraph body
// per the vendored voice + about; the draft is stored ON THE LEAD as
// `draft_pending` and is NOT placed in Gmail. The human gate at /review must
// approve it before any Gmail draft is created (see /api/review/draft).
import { callClaude, parseJsonObject } from "./llm";
import { VOICE, ABOUT } from "./knowledge";
import { listLeads, updateRecords, TABLES, FIELDS, leadsBase } from "@/lib/airtable";
import type { RunResult } from "./runLog";

const SYSTEM = `You draft ONE cold introduction email for Tejas Arackal's data-engineering job search. Follow the voice rules and the writer profile exactly.

=== WRITER PROFILE ===
${ABOUT}

=== VOICE RULES ===
${VOICE}

Return ONLY a JSON object, no prose:
{"subject": string, "body": string}

- subject: 6-10 words, per the subject-line format.
- body: the THREE paragraphs only (P1 hook, P2 concrete connection, P3 ask), separated by a single blank line. Do NOT include the "Hello {name}," greeting or the "Best,/Tejas" closing — those are added later. First sentence must start with "I".`;

interface Draft {
  subject: string;
  body: string;
}

export async function draftEmails(
  opts: { maxItems?: number; dryRun?: boolean; cursor?: { offset?: number } } = {},
): Promise<RunResult> {
  const max = opts.maxItems ?? 1;
  // Cursor threads a running total across chunks so the final message reflects
  // the WHOLE run (each invocation only drafts one item).
  const prior = (opts.cursor ?? {}) as { offset?: number; tDrafted?: number; tSkipped?: number };
  const offset = prior.offset ?? 0;
  const dryRun = Boolean(opts.dryRun);

  const approved = (await listLeads())
    .filter((l) => l.status === "approved")
    .sort((a, b) => a.id.localeCompare(b.id)); // stable order for the cursor
  const batch = approved.slice(offset, offset + max);

  let drafted = 0,
    skipped = 0;

  for (const lead of batch) {
    const context = [
      `Company: ${lead.company}`,
      lead.contactName ? `Recipient: ${lead.contactName}${lead.title ? `, ${lead.title}` : ""}` : null,
      lead.recentSignal ? `Signal to reference: ${lead.recentSignal}` : null,
      lead.hiringSignal ? `Signal type: ${lead.hiringSignal}` : null,
      lead.roleLevel ? `Target role level: ${lead.roleLevel}` : null,
      lead.companyStage ? `Company stage: ${lead.companyStage}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const reply = await callClaude({
      system: SYSTEM,
      user: `Draft the email for this lead:\n${context}`,
      model: process.env.ANTHROPIC_DRAFT_MODEL || "claude-sonnet-4-6",
      maxTokens: 450, // a 3-paragraph email is ~200 tokens; smaller cap = faster, fits the function limit
    });
    const draft = parseJsonObject<Draft>(reply);
    if (!draft || !draft.subject || !draft.body) {
      skipped++;
      continue;
    }

    if (!dryRun) {
      await updateRecords(TABLES.leads, leadsBase(), [
        {
          id: lead.id,
          fields: {
            [FIELDS.leads.emailSubject]: draft.subject.trim(),
            [FIELDS.leads.emailBody]: draft.body.trim(),
            [FIELDS.leads.status]: "draft_pending",
          },
        },
      ]);
    }
    drafted++;
  }

  const tDrafted = (prior.tDrafted ?? 0) + drafted;
  const tSkipped = (prior.tSkipped ?? 0) + skipped;
  const nextOffset = offset + batch.length;
  const remaining = Math.max(0, approved.length - nextOffset);
  return {
    counts: { approved: approved.length, drafted: tDrafted, skipped: tSkipped, remaining, nextOffset },
    partial: remaining > 0,
    cursor: { offset: nextOffset, tDrafted, tSkipped },
    notes:
      `${dryRun ? "[DRY RUN] " : ""}` +
      (remaining > 0
        ? `drafted ${tDrafted} so far — ${remaining} approved lead${remaining === 1 ? "" : "s"} remaining`
        : `drafted ${tDrafted} total → draft_pending${tSkipped ? `, ${tSkipped} skipped` : ""}`),
  };
}
