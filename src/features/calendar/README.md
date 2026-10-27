# F3 — Calendar View (Phase 4)

Stories F3.1–F3.5. Built in Phase 4.

- `/dashboard` is the Today summary: today's meetings, then the next five. Each links to
  `/dashboard/calendar?booking=<id>`, which opens that booking's details. Host emails link
  there too.
- `/dashboard/calendar` is FullCalendar with month, week, day and list views. Under 768px it
  starts on the list view, with day and month in the footer (F3.3).
- **Time zones:** FullCalendar needs a plugin for named zones, so it runs in `"UTC"` and gets
  the host's wall-clock times with no offset (`floating.ts`). Every view shows the host's
  clock whatever zone the browser is in. Visible ranges come back the same way and are
  converted with `fromFloating`.
- **Blocked time (F3.4):** full-day blocks are hatched background events, custom-hours days are
  tinted, and time outside weekly hours is shaded via `businessHours`. Bookings use the
  `--booking` color. Cancelled bookings are left off the calendar.
- **Details panel (F3.2):** invitee, email, both people's times, location, answers, notes,
  cancel reason and the `booking_events` history. Actions: reschedule, cancel (each with an
  optional message to the invitee) and mark no-show once the meeting has started (F3.5).

| File                       | What it does                                         |
| -------------------------- | ---------------------------------------------------- |
| `queries.ts`               | Calendar data, business hours, booking detail, Today |
| `detail.ts`                | Turns a booking into the panel's serializable view   |
| `floating.ts`              | Host-local "floating" times for FullCalendar         |
| `actions.ts`               | Server actions the calendar calls for ranges/details |
| `components/calendar-view` | FullCalendar plus the panel                          |
| `components/booking-panel` | Details and host actions                             |
