// Add-listing form page (PRD-multi-user §7.7). Server-rendered shell + the
// ListingForm client island. `searchParams.company` prefills the company
// field — the targets editor links here as /listings/new?company=…
// Under view-as the form renders disabled (the API's assertWritable is the
// actual guarantee, D7).

import { Header } from "@/components/layout/Header";
import { Card, CardBody } from "@/components/ui/Card";
import { ListingForm } from "@/components/crud/ListingForm";
import { getViewContext } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add listing" };

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: { company?: string | string[] };
}) {
  const ctx = await getViewContext();
  const company = Array.isArray(searchParams.company) ? searchParams.company[0] : searchParams.company;

  return (
    <>
      <Header title="Add listing" subtitle="Track a role you found yourself" />
      <main className="p-8">
        <Card className="max-w-[640px]">
          <CardBody className="px-6 py-6">
            <ListingForm initialCompany={company ?? ""} readOnly={ctx.isViewAs} />
          </CardBody>
        </Card>
      </main>
    </>
  );
}
