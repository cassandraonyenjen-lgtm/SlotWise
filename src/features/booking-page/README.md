# F2 — Meeting Types & Public Booking Page (Phase 2)

Stories F2.1–F2.6.

Double-booking (F2.6): insert the booking in a transaction and let Postgres decide. The
`bookings_no_overlap` exclusion constraint rejects any overlapping live booking for the same
host; catch it with `isSlotTakenError` and show "This time was just taken" plus refreshed
slots. Don't add a "check then insert" in app code; it races.

Public booking endpoints also need rate limiting (Upstash) and Turnstile before launch.
