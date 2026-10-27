import type { Metadata } from "next";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-2 px-4">
      <h1 className="text-2xl font-semibold">Check your email</h1>
      <p className="text-muted-foreground">We sent you a sign-in link. It expires in 24 hours.</p>
    </main>
  );
}
