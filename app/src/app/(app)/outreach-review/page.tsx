import { Header } from "@/components/layout/Header";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { JobTrigger } from "@/components/workflows/JobTrigger";
import { listLeads, isConfigured } from "@/lib/airtable";
import { getViewContext } from "@/lib/session";
import type { OutreachContact } from "@/lib/types";
import { LeadActions, DraftActions } from "./ReviewActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Outreach Review" };

async function loadLeads(userEmail: string): Promise<OutreachContact[]> {
  if (!isConfigured()) return [];
  try {
    // Live read — this is an interactive gate; an action must show immediately.
    return await listLeads(userEmail, { fresh: true });
  } catch {
    return [];
  }
}

export default async function ReviewPage() {
  const ctx = await getViewContext();
  const leads = await loadLeads(ctx.effectiveEmail);
  const toApprove = leads.filter((l) => l.status === "research");
  const approved = leads.filter((l) => l.status === "approved");
  const toReview = leads.filter((l) => l.status === "draft_pending");
  const editable = !ctx.isViewAs;

  return (
    <>
      <Header
        title="Outreach Review"
        subtitle="Human gates — approve researched leads, then review generated drafts. Nothing reaches Gmail without approval."
      />
      <main className="p-8 space-y-8">
        {editable && approved.length > 0 && (
          <Card>
            <CardBody>
              <div className="flex items-center justify-between gap-4">
                <p className="text-[13px] text-brand-body">
                  {approved.length} approved {approved.length === 1 ? "lead is" : "leads are"} ready for a draft.
                </p>
                <JobTrigger workflow="draft_emails" idleLabel="Draft outreach" busyLabel="Drafting…" />
              </div>
            </CardBody>
          </Card>
        )}

        {/* Gate 1 — lead approval */}
        <section className="space-y-3">
          <h2 className="text-[14px] font-semibold text-brand-heading">
            Leads to approve <span className="text-brand-muted font-normal">({toApprove.length})</span>
          </h2>
          {toApprove.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-[13px] text-brand-muted">
                  No researched leads waiting. Click <span className="font-medium">Research leads</span> on the Outreach page to find recruiters at your target companies.
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {toApprove.map((l) => (
                <Card key={l.id}>
                  <div className="p-5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[14px] font-semibold text-brand-heading">{l.contactName ?? "Unknown contact"}</p>
                        <p className="text-[12px] text-brand-muted">
                          {l.title ? `${l.title} · ` : ""}
                          {l.company}
                        </p>
                      </div>
                      <StatusBadge label={l.channel ?? "—"} />
                    </div>
                    {l.recentSignal && <p className="text-[12px] text-brand-body">{l.recentSignal}</p>}
                    <p className="text-[11px] text-brand-muted font-mono">{l.email ?? l.linkedin ?? "no contact"}</p>
                    {editable && (
                      <div className="pt-1">
                        <LeadActions id={l.id} />
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Gate 2 — draft review */}
        <section className="space-y-3">
          <h2 className="text-[14px] font-semibold text-brand-heading">
            Drafts to review <span className="text-brand-muted font-normal">({toReview.length})</span>
          </h2>
          {toReview.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-[13px] text-brand-muted">
                  No generated drafts waiting. Approve leads above, then click <span className="font-medium">Draft outreach</span>.
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {toReview.map((l) => (
                <Card key={l.id}>
                  <CardHeader
                    title={l.contactName ?? "Unknown contact"}
                    subtitle={`${l.title ? `${l.title} · ` : ""}${l.company}${l.email ? ` · ${l.email}` : " · LinkedIn only"}`}
                  />
                  <CardBody>
                    {editable ? (
                      <DraftActions
                        id={l.id}
                        subject={l.emailSubject ?? ""}
                        body={l.emailBody ?? ""}
                        hasEmail={Boolean(l.email)}
                      />
                    ) : (
                      <p className="text-[12px] text-brand-muted">Read-only in view-as mode.</p>
                    )}
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
