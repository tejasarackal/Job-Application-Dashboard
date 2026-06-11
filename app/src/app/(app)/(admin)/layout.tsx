// (admin) route group — owner-only surfaces (/workflows, /outreach-review,
// /admin). requireAdmin() redirects non-admins to "/" (never a 403 page).
// Nav hiding in TopNav is cosmetic; this layout is the gate (PRD §7.3).

import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
