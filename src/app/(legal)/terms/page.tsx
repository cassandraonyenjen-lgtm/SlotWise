import type { Metadata } from "next";
import { LEGAL_UPDATED, legalContact } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of service" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  const contact = legalContact();
  return (
    <>
      <h1>Terms of service</h1>
      <p className="text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      <p>By creating a Slotwise account or booking through Slotwise, you agree to these terms.</p>

      <h2>Using Slotwise</h2>
      <ul>
        <li>You must give accurate information and keep your sign-in email secure.</li>
        <li>
          Hosts are responsible for their availability, meeting details and how they use the
          information invitees share with them.
        </li>
        <li>
          Don&apos;t use Slotwise to send spam, book time you don&apos;t intend to use, or try to
          access other people&apos;s bookings or accounts.
        </li>
      </ul>

      <h2>Bookings</h2>
      <p>
        A booking is an arrangement between the host and the invitee. Slotwise is not a party to it
        and isn&apos;t responsible for missed, late or cancelled meetings. Hosts may limit how close
        to a meeting it can be changed online.
      </p>

      <h2>Availability of the service</h2>
      <p>
        We aim to keep Slotwise running reliably but can&apos;t promise it will always be available
        or error-free. We may change or stop features with reasonable notice.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can delete your account at any time from Settings. We may suspend accounts that break
        these terms.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, Slotwise is provided &ldquo;as is&rdquo; and we aren&apos;t
        liable for indirect or consequential losses.
      </p>

      <h2>Contact</h2>
      <p>
        <a className="text-primary underline" href={`mailto:${contact}`}>
          {contact}
        </a>
      </p>
    </>
  );
}
