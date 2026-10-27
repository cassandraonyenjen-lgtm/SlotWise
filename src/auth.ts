import NextAuth, { type NextAuthConfig } from "next-auth";
import { redirect } from "next/navigation";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { env } from "@/env";
import { seedDefaultAvailability } from "@/features/availability/queries";
import { trackServer } from "@/lib/analytics";

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
    events: {
      // New hosts start with Mon–Fri 09:00–17:00 so their booking page works immediately.
      async createUser({ user }) {
        if (!user.id) return;
        await seedDefaultAvailability(getDb(), user.id);
        await trackServer(user.id, "host_signed_up");
      },
    },
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

/**
 * The signed-in host's id, or a redirect to sign-in. Dashboard pages render alongside the
 * layout, so they can't rely on the layout's own redirect having run first.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  return session.user.id;
}
