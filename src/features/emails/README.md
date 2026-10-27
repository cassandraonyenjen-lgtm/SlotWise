# F4 — Email Confirmations & Reminders (Phase 3)

Stories F4.1–F4.5.

- Templates: React Email components in `emails/templates/`, sent through Resend.
- Invites: `ics` package, `UID = bookings.ics_uid`, `SEQUENCE = bookings.ics_sequence`;
  reschedules bump the sequence, cancellations send `METHOD:CANCEL` with the same UID.
- Reminders: delayed jobs (Inngest or Trigger.dev, decide in Phase 3). Handlers re-read the
  booking and skip if it was cancelled or moved, and write an `email_log` row with an
  `idempotency_key` so retries can't double-send.
- Always render times in the recipient's zone (invitee: `bookings.invitee_timezone`,
  host: `users.timezone`).

Not installed yet: `resend`, `@react-email/components`, `ics`, and the job runner.
