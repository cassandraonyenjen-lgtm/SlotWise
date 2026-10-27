import type { Metadata } from "next";
import { LEGAL_UPDATED } from "@/lib/legal";

export const metadata: Metadata = { title: "Cookie notice" };

export default function CookiesPage() {
  return (
    <>
      <h1>Cookie notice</h1>
      <p className="text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      <p>
        Slotwise only sets cookies that are strictly necessary for the service to work, so we
        don&apos;t ask for consent.
      </p>
      <ul>
        <li>
          <strong>Sign-in session</strong> (<code>authjs.session-token</code>): keeps hosts signed
          in. Expires after 30 days or when you sign out.
        </li>
        <li>
          <strong>Security tokens</strong> (<code>authjs.csrf-token</code>,{" "}
          <code>authjs.callback-url</code>): protect the sign-in process.
        </li>
      </ul>
      <p>
        Invitees booking a meeting get no cookies from Slotwise. Our product analytics run without
        cookies or other storage on your device. Cloudflare Turnstile, which checks the booking form
        for bots, may use its own strictly necessary cookies.
      </p>
    </>
  );
}
