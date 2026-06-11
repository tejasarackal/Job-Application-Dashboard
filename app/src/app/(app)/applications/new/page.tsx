// Log-application form page (PRD-multi-user §7.7). Server shell + the
// ApplicationForm client island. Under view-as the form renders disabled
// (the API's assertWritable is the actual guarantee, D7).

import { Header } from "@/components/layout/Header";
import { Card, CardBody } from "@/components/ui/Card";
import { ApplicationForm } from "@/components/crud/ApplicationForm";
import { getViewContext } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log application" };

export default async function NewApplicationPage() {
  const ctx = await getViewContext();

  return (
    <>
      <Header title="Log application" subtitle="Record an application you submitted" />
      <main className="p-8">
        <Card className="max-w-[640px]">
          <CardBody className="px-6 py-6">
            <ApplicationForm readOnly={ctx.isViewAs} />
          </CardBody>
        </Card>
      </main>
    </>
  );
}
