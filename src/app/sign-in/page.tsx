import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { enabledProviders, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RATE_LIMITED_MESSAGE, rateLimit } from "@/lib/rate-limit";

export const metadata: Metadata = { title: "Sign in" };
// Providers depend on runtime env, so never prerender this page.
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function SignInPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const providers = enabledProviders();
  const none = !providers.email && !providers.google;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>Sign in to Slotwise</h1>
          </CardTitle>
          <CardDescription>No password needed.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error === "rate_limited"
                ? RATE_LIMITED_MESSAGE
                : "Sign-in didn't work. Please try again."}
            </p>
          )}
          {providers.email && (
            <form
              className="flex flex-col gap-3"
              action={async (formData) => {
                "use server";
                const email = String(formData.get("email") ?? "")
                  .trim()
                  .toLowerCase();
                // Per IP and per address, so nobody can flood an inbox with sign-in links.
                const [byIp, byEmail] = await Promise.all([
                  rateLimit("signIn"),
                  rateLimit("signIn", `email:${email}`),
                ]);
                if (!byIp.ok || !byEmail.ok) redirect("/sign-in?error=rate_limited");
                await signIn("resend", { email, redirectTo: "/dashboard" });
              }}
            >
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
              <Button type="submit">Email me a sign-in link</Button>
            </form>
          )}
          {providers.google && (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/dashboard" });
              }}
            >
              <Button type="submit" variant="outline" className="w-full">
                Continue with Google
              </Button>
            </form>
          )}
          {none && (
            <p className="text-muted-foreground text-sm" role="status">
              No sign-in providers are configured. Set <code>AUTH_RESEND_KEY</code> or the{" "}
              <code>AUTH_GOOGLE_*</code> variables in <code>.env.local</code>.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
