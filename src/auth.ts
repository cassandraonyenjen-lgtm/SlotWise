import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { env } from "@/env";

/**
 * Auth.js v5: passwordless magic link (Resend) + Google OAuth, database sessions.
 * Providers are only registered when their credentials exist, so local dev and CI work
 * without any third-party keys.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const e = env();
  const providers: NextAuthConfig["providers"] = [];

  if (e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET) providers.push(Google);
  if (e.AUTH_RESEND_KEY) providers.push(Resend({ from: e.EMAIL_FROM }));

  return {
    adapter: DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),
    session: { strategy: "database" },
    providers,
    pages: { signIn: "/sign-in", verifyRequest: "/sign-in/check-email" },
    trustHost: true,
    callbacks: {
      session({ session, user }) {
        session.user.id = user.id;
        return session;
      },
    },
  };
});

export const enabledProviders = () => {
  const e = env();
  return {
    google: Boolean(e.AUTH_GOOGLE_ID && e.AUTH_GOOGLE_SECRET),
    email: Boolean(e.AUTH_RESEND_KEY),
  };
};
