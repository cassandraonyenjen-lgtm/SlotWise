# F1 — Availability Management (Phase 1)

Stories F1.1–F1.6. The slot engine is the heart of the product: give it full unit-test
coverage, including DST transitions in America/New_York, Europe/London, Africa/Lagos and
Australia/Sydney (see `slots.test.ts` todos).

Rules:

- Weekly hours and overrides are wall-clock `HH:mm` in the host's IANA zone. Convert to UTC
  per date with `@date-fns/tz`; never add fixed offsets by hand.
- An override date replaces that weekday's hours entirely; `isUnavailable` blocks the day.
- Apply buffers, min notice, max days ahead and the daily cap when computing slots, and
  re-check all of them server-side when a booking is submitted (F1.5).
