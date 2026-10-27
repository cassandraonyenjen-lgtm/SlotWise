# F4 — Email Confirmations & Reminders (Phase 3)

Stories F4.1–F4.5. Built in Phase 3.

## How an email gets sent

1. A booking changes. `bookSlotAction` (and the reschedule/cancel actions in
   `booking-management/actions.ts`) call `notifyBookingEvent(…)` from `dispatch.ts`, inside
   Next's `after()` so nobody is kept waiting.
2. With Inngest configured, that sends a `booking/created` (or `rescheduled`, `cancelled`)
   event. Two functions in `src/inngest/functions.ts` pick it up:
   - `booking-notifications` sends the confirmation / host notice (or reschedule / cancel
     emails) with Inngest's retries.
   - `booking-reminders` plans reminders from the host's policy, sleeps until each one is
     due, and sends it. A `booking/cancelled` event cancels the run.
3. Without Inngest (local dev, CI), confirmations are sent inline and reminders are skipped.
4. `send.ts` does the actual work. Every email gets an idempotency key such as
   `reminder:<bookingId>:<icsSequence>:24h`; `deliver()` records it in `email_log` and skips
   any key that already went out, so retries never double-send (F4.3). Resend gets the same
   key as a second guard.

Reminder handlers re-read the booking and return `"stale"` if it was cancelled, moved to a
new time (`ics_sequence` changed) or has already started.

## Pieces

| File                                                     | What it does                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `messages.ts`                                            | Builds each email (subject, HTML, plain text, `.ics`) for one person        |
| `templates/`                                             | React Email template shared by all five emails                              |
| `format.ts`                                              | Times in the recipient's zone, `"Host via Slotwise"` sender name            |
| `context.ts`                                             | Loads a booking with its host, meeting type and answers                     |
| `send.ts`                                                | `deliver`, `sendBookingNotifications`, `reminderSchedule`, `sendReminder`   |
| `transport.ts`                                           | Resend, a console logger when no key is set, and an in-memory one for tests |
| `dispatch.ts`                                            | Inngest when configured, inline otherwise; never throws                     |
| `schemas.ts`, `settings.ts`, `actions.ts`, `components/` | `/dashboard/settings`: display name and reminder policy                     |

## Rules

- Times are always in the recipient's zone: invitee from `bookings.invitee_timezone`, host
  from `users.timezone`.
- Calendar invites reuse `bookings.ics_uid`; reschedules bump `ics_sequence`, cancellations
  send `METHOD:CANCEL` with the same UID so calendars update the existing event.
- Manage links are `HMAC(MANAGE_LINK_SECRET, bookingId)`; only the SHA-256 of the token is
  stored. Jobs can rebuild the link from the booking id, so the token never sits in a queue.
- Replies go to the other person (`Reply-To`), not to the no-reply sender.

## Deliverability (F4.5)

Verify the sending domain in Resend and add the SPF and DKIM records it gives you, plus a
DMARC record (start with `v=DMARC1; p=none; rua=mailto:you@yourdomain`). `EMAIL_FROM` must
use that domain.

## Delivery tracking

In Resend → Webhooks, point a webhook at `/api/webhooks/resend` with the `email.delivered`,
`email.bounced` and `email.complained` events, and set `RESEND_WEBHOOK_SECRET` to its signing
secret. Each event updates the matching `email_log` row by provider id (`webhooks.ts`); a
bounce or complaint is never overwritten by a later "delivered". `/api/health` reports the
24-hour failure rate (failed + bounced) for an uptime monitor to alert on above 2%.

## Not done yet

- Logo upload. The template already shows `users.logo_url` when it's set.
