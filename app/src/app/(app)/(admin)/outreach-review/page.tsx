import { Header } from "@/components/layout/Header";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
  const toReview = leads.filter((l) => l.status === "draft_pending");

  return (
    <>
      <Header
        title="Outreach Review"
        subtitle="Human gates — approve researched leads, then review generated drafts. Nothing reaches Gmail without approval."
      />
      <main className="p-8 space-y-8">
        {/* Gate 1 — lead approval */}
        <section className="space-y-3">
          <h2 className="text-[14px] font-semibold text-brand-heading">
            Leads to approve <span className="text-brand-muted font-normal">({toApprove.length})</span>
          </h2>
          {toApprove.length === 0 ? (
            <Card>
              <CardBody>
                <p className="text-[13px] text-brand-muted">
                  No researched leads waiting. Run <span className="font-mono">Lead Research</span> on the Workflows page.
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
                    <div className="pt-1">
                      <LeadActions id={l.id} />
                    </div>
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
                  No generated drafts waiting. Approve leads above, then run <span className="font-mono">Email Drafting</span>.
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
                    <DraftActions
                      id={l.id}
                      subject={l.emailSubject ?? ""}
                      body={l.emailBody ?? ""}
                      hasEmail={Boolean(l.email)}
                    />
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
