# F5 — Booking Management (Phase 4)

Stories F5.1–F5.5. Invitees reach `/manage/[token]` from their email. Look the booking up by
`hashManageToken(token)` (see `src/lib/tokens.ts`); never put booking IDs in public URLs.
Tokens stop working once the meeting has started, and within `users.cancel_cutoff_min` the
page tells the invitee to contact the host instead (F5.4).

Reschedules update the booking row in place and bump `ics_sequence`; log each change in
`booking_events` for the history shown in the dashboard (F3.2).
