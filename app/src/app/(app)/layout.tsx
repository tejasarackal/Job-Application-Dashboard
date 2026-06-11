// (app) route group — the authenticated product shell (PRD §7.3). Every page
// inside renders under TopNav; requireUser() handles the signed-in/active
// gate (and redirects not-yet-onboarded users to /onboarding). Pages still
// call the session helpers themselves — layouts don't re-run on soft
// navigation (PRD §5.2), so this is the shell, not the enforcement layer.

import { requireUser, getViewContext } from "@/lib/session";
import { TopNav } from "@/components/layout/TopNav";
import { ViewAsBanner } from "@/components/layout/ViewAsBanner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const ctx = await getViewContext();

  return (
    <>
      {ctx.isViewAs && <ViewAsBanner targetEmail={ctx.effectiveEmail} />}
      <TopNav isAdmin={ctx.isAdmin} isViewAs={ctx.isViewAs} />
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </>
  );
}
