// Log-interview form page (PRD-multi-user §7.7). Server shell + the
// InterviewForm client island. Under view-as the form renders disabled
// (the API's assertWritable is the actual guarantee, D7).

import { Header } from "@/components/layout/Header";
import { Card, CardBody } from "@/components/ui/Card";
import { InterviewForm } from "@/components/crud/InterviewForm";
import { getViewContext } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log interview" };

export default async function NewInterviewPage() {
  const ctx = await getViewContext();

  return (
    <>
      <Header title="Log interview" subtitle="Record an interview round" />
      <main className="p-8">
        <Card className="max-w-[640px]">
          <CardBody className="px-6 py-6">
            <InterviewForm readOnly={ctx.isViewAs} />
          </CardBody>
        </Card>
      </main>
    </>
  );
}
