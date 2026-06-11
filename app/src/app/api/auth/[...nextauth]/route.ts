// NextAuth v5 catch-all route (Node runtime) — the only place the signIn
// callback (and its Users-table lookup) ever executes. Public by design;
// signup policy is enforced inside the callback (PRD §5.3).

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
