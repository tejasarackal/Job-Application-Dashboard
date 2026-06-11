// Edge-safe NextAuth v5 config (the "split config" pattern). middleware.ts
// instantiates NextAuth from THIS object only, so nothing here may pull in
// Node-only modules or Airtable. The Users-table lookup lives in the signIn
// callback added by lib/auth.ts, which only ever executes in the Node runtime
// via app/api/auth/[...nextauth]/route.ts.
//
// Env vars (AUTH_SECRET, AUTH_GOOGLE_ID/SECRET) are read lazily by NextAuth at
// request time — never validated at module load, because secrets resolve only
// in the Vercel runtime (`npm run build` runs with zero env).

import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { normalizeEmail } from "./auth-shared";

export const authConfig: NextAuthConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  // JWT sessions, no adapter (PRD D1). 24h cap bounds revocation lag; the
  // per-request Account Status check in session.ts (D4) closes the gap.
  session: { strategy: "jwt", maxAge: 86400 },
  trustHost: true,
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    // Expose {email} only — role is never a JWT claim that authorizes
    // anything (D3), and name/picture stay out of the token surface.
    jwt({ token, profile }) {
      if (profile?.email) token.email = normalizeEmail(String(profile.email));
      else if (typeof token.email === "string") token.email = normalizeEmail(token.email);
      delete token.name;
      delete token.picture;
      return token;
    },
    session({ session, token }) {
      const email = typeof token.email === "string" ? normalizeEmail(token.email) : "";
      return { ...session, user: { ...session.user, email, name: null, image: null } };
    },
  },
};
