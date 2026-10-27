# F1 — Availability Management

Stories F1.1–F1.6. Built in Phase 1.

| File          | What it does                                                                                |
| ------------- | ------------------------------------------------------------------------------------------- |
| `slots.ts`    | `computeSlots` (pure slot engine) and `isSlotAvailable` (server re-check of one start time) |
| `time.ts`     | Wall-clock ↔ UTC conversion with `@date-fns/tz`, local-date helpers                         |
| `schemas.ts`  | Zod schemas shared by the page and the server actions (overlap rejection, dates, zones)     |
| `queries.ts`  | Database reads/writes; takes `db` so DB tests can call it directly                          |
| `actions.ts`  | Server actions behind the availability page (auth + validation)                             |
| `components/` | Time zone picker, weekly hours editor, date overrides                                       |

Rules the engine follows:

- Weekly hours and overrides are wall-clock `HH:mm` in the host's IANA zone, converted per
  host-local date, so DST moves the UTC times and never the host's hours. Slots step through
  each range in real elapsed time (a 00:00–05:00 range on spring-forward night is 4 hours).
- Times inside a spring-forward gap resolve forward; times in a fall-back overlap use the
  first occurrence.
- Any override for a date replaces that weekday's hours; a full-day block wins.
- Buffers pad the candidate slot on both sides against existing bookings. Minimum notice is
  measured from now; the booking window counts host-local calendar days.
- The daily cap counts all of the host's live bookings on that host-local day.
- Start times step by the meeting duration (`slotStepMin` can override it).

When the booking flow lands (Phase 2), call `isStartBookable` before inserting, and still
rely on the `bookings_no_overlap` constraint for races.

Booking-rule fields (buffers, notice, window, cap) live on `meeting_types`, so their editing
UI ships with meeting types in Phase 2. The engine already honours them.
