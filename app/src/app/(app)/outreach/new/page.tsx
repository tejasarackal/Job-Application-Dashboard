// Log-outreach form page (PRD-multi-user §7.7). Server shell + the
// OutreachForm client island (writes the manual Outreach table). Under
// view-as the form renders disabled (the API's assertWritable is the actual
// guarantee, D7).

import { Header } from "@/components/layout/Header";
import { Card, CardBody } from "@/components/ui/Card";
import { OutreachForm } from "@/components/crud/OutreachForm";
import { getViewContext } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log outreach" };

export default async function NewOutreachPage() {
  const ctx = await getViewContext();

  return (
    <>
      <Header title="Log outreach" subtitle="Record a contact you reached out to" />
      <main className="p-8">
        <Card className="max-w-[640px]">
          <CardBody className="px-6 py-6">
            <OutreachForm readOnly={ctx.isViewAs} />
          </CardBody>
        </Card>
      </main>
    </>
  );
}
