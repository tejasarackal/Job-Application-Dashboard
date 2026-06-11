// NextAuth v5 entry point (Node runtime). Extends the edge-safe split config
// (lib/auth.config.ts) with the signIn callback — the ONE place identity
// enters the system (PRD §4). Middleware must keep importing auth.config.ts,
// never this file, so the Airtable-backed Users lookup stays out of the edge
// bundle.
//
// All env reads are lazy (request time). Nothing here throws at module load —
// `npm run build` runs with zero env.

import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { isOwner, normalizeEmail } from "./auth-shared";
import {
  countUsers,
  createUserRow,
  getUserRow,
  touchLastLogin,
  usersConfigured,
} from "./users";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Fail closed: ANY thrown error inside this callback denies the sign-in.
    // A session must never exist without an admitted identity (PRD §5.1).
    async signIn({ profile }) {
      try {
        // Strict: Google must assert the address is verified.
        if (!profile || profile.email_verified !== true) return false;
        const email = normalizeEmail(String(profile.email ?? ""));
        if (!email) return false;

        // Owner is always admitted — admin identity is the OWNER_EMAIL env
        // (D3), never a table row, so a missing/broken Users table can never
        // lock the owner out.
        if (isOwner(email)) return true;

        // M0 reality: no Users table yet → non-owners cannot have rows or
        // sign up. Same copy as the kill switch — factual, not apologetic.
        if (!usersConfigured()) return "/login?error=signups-disabled";

        const row = await getUserRow(email);
        if (row) {
          if (row.accountStatus === "disabled") return false;
          if (row.accountStatus === "pending") return "/login?error=pending-approval";
          // Best-effort, throttled once/UTC-day; never blocks an existing user.
          void touchLastLogin(row);
          return true;
        }

        // New signup path.
        if (process.env.AUTH_DISABLE_SIGNUP === "1") return "/login?error=signups-disabled";
        const cap = Number(process.env.USER_CAP);
        if (Number.isFinite(cap) && cap > 0 && (await countUsers()) >= cap) {
          return "/login?error=user-cap";
        }
        await createUserRow({
          email,
          name: typeof profile.name === "string" ? profile.name : undefined,
          authSub: typeof profile.sub === "string" ? profile.sub : undefined,
          accountStatus: process.env.AUTH_REQUIRE_APPROVAL === "1" ? "pending" : "active",
          onboardingStatus: "pending",
        });
        // Post-create re-query: >1 row for one email throws inside getUserRow
        // → caught below → deny (duplicate rows are a security anomaly, D4).
        const created = await getUserRow(email);
        if (!created) return false; // create didn't land — fail closed
        return process.env.AUTH_REQUIRE_APPROVAL === "1"
          ? "/login?error=pending-approval"
          : true;
      } catch (e) {
        console.error("auth: signIn callback failed — denying", e);
        return false;
      }
    },
  },
});
