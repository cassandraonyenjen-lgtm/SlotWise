# F2 — Meeting Types & Public Booking Page

Stories F2.1–F2.6. Built in Phase 2.

| File                                     | What it does                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `schemas.ts`                             | Zod schemas for meeting types and booking requests, shared by forms and server actions |
| `meeting-types.ts`                       | Host queries: list/get/create/update/delete meeting types, set username                |
| `public.ts`                              | Public reads (host page, meeting type, slots) and `createBooking`                      |
| `actions.ts`                             | Host server actions (signed in)                                                        |
| `booking-actions.ts`                     | `bookSlotAction`, the public booking action (no sign-in)                               |
| `calendar-urls.ts` / `calendar-links.ts` | Google/Outlook links (client-safe) and `.ics` via the `ics` package                    |
| `components/`                            | Meeting type form, booking link form, invitee booking flow                             |

Public routes: `/[username]`, `/[username]/[meetingType]`, and `GET /api/public/slots`.

How a booking is made (`createBooking`):

1. Look up the active meeting type by username + slug (reserved names never resolve).
2. Check required questions are answered.
3. Re-check the start time against current availability and rules (F1.5).
4. Insert booking, answers and a `created` booking event in one transaction. The
   `bookings_no_overlap` exclusion constraint makes Postgres reject a racing insert; that is
   reported as "taken" and the page shows "This time was just taken" with refreshed times.
5. Generate a 256-bit manage token; only its hash is stored. Phase 3 emails will carry it.

Questions keep their ids across edits so past answers stay linked; meeting types with
bookings can't be deleted, only turned off.

Still to do before launch (PRD NFRs, planned for Phase 5): rate limiting on the public
endpoints (Upstash) and Cloudflare Turnstile on the booking form.
