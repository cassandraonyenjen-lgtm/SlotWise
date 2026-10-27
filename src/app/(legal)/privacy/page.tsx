import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_UPDATED, legalContact } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const contact = legalContact();
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      <p>
        Slotwise helps professionals (&ldquo;hosts&rdquo;) let clients (&ldquo;invitees&rdquo;) book
        time with them. This policy explains what we collect, why, and your rights under laws such
        as the GDPR and Nigeria&apos;s NDPA.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Hosts:</strong> name, email address, username, time zone, working hours, meeting
          types and settings, and sign-in records.
        </li>
        <li>
          <strong>Invitees:</strong> only what the booking form asks for: name, email address, time
          zone, any answers to the host&apos;s questions, and optional notes.
        </li>
        <li>
          <strong>Technical data:</strong> IP addresses (used briefly for abuse protection), error
          reports, and anonymous product usage events.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>To create, change and cancel bookings, and to send confirmations and reminders.</li>
        <li>To keep the service secure, including rate limiting and bot protection.</li>
        <li>To find and fix errors and understand which features are used.</li>
      </ul>
      <p>
        We process data to provide the service you asked for (contract) and for our legitimate
        interest in keeping it secure and working. We do not sell personal data or use it for
        advertising.
      </p>

      <h2>Who we share it with</h2>
      <p>
        Service providers that run parts of Slotwise for us, under data processing agreements:
        hosting and database, email delivery (Resend), background jobs (Inngest), error monitoring
        (Sentry), product analytics (PostHog), rate limiting (Upstash) and bot protection
        (Cloudflare Turnstile). Hosts see the details invitees give when booking them.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Host data is kept while the account is open. When a host deletes their account, their
        profile, meeting types, availability and all bookings are deleted immediately. Backups roll
        off within 30 days.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to access, correct, export or delete your data, or object to how it&apos;s used.
        Hosts can download their data and delete their account from Settings. Invitees can cancel a
        booking from their email, and can ask the host or us at{" "}
        <a className="text-primary underline" href={`mailto:${contact}`}>
          {contact}
        </a>{" "}
        to remove their details. You can also complain to your data protection authority.
      </p>

      <h2>Cookies</h2>
      <p>
        We only use cookies needed to keep you signed in. See the{" "}
        <Link className="text-primary underline" href="/cookies">
          cookie notice
        </Link>
        .
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy:{" "}
        <a className="text-primary underline" href={`mailto:${contact}`}>
          {contact}
        </a>
        .
      </p>
    </>
  );
}
