# F5 — Booking Management (Phase 4)

Stories F5.1–F5.5. Built in Phase 4.

## Invitees: `/manage/[token]`

The Reschedule and Cancel buttons in emails open `/manage/<token>?action=reschedule|cancel`.
The page is `noindex` and `no-referrer`. The token is `HMAC(MANAGE_LINK_SECRET, bookingId)`
(256 bits); only its SHA-256 is stored and compared, and booking ids never appear in public
URLs (F5.5). What the link allows depends on `manageState()`:

| State           | When                                         | Page shows                         |
| --------------- | -------------------------------------------- | ---------------------------------- |
| `active`        | Confirmed and outside the cutoff             | Reschedule (slot picker) or cancel |
| `within_cutoff` | Closer than `users.cancel_cutoff_min` (F5.4) | "Contact your host" with email     |
| `cancelled`     | Already cancelled                            | Link to book again                 |
| `past`          | Started, or marked no-show                   | Nothing to change                  |

## Hosts

From the calendar's details panel, hosts can reschedule or cancel with an optional message
(F5.3). The cutoff doesn't apply to them, and they can move bookings of a meeting type they've
switched off. The cutoff is set in `/dashboard/settings`.

## How changes are written (`manage.ts`)

- **Reschedule** updates the row in place: new start/end, `ics_sequence + 1`, same ICS UID.
  The new time must be a slot `computeSlots` would offer, with the booking's own time counted
  as free (`loadSlotQuery(..., { excludeBookingId })`). The write takes the host's advisory
  lock, and the exclusion constraint still has the final say.
- **Cancel** sets `cancelled`, the reason, who cancelled and when, and bumps the sequence so
  the `METHOD:CANCEL` invite supersedes the original. The slot frees immediately.
- Both only apply if the row is unchanged since it was read (status and sequence), so two
  tabs can't both win. Each writes a `booking_events` row for the history panel.
- After a change, `notifyBookingEvent` sends reschedule/cancel emails to both people. With
  Inngest, a cancellation also stops pending reminders, and a reschedule plans new ones; old
  reminders see the sequence moved on and skip.
