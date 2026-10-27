-- PRD §7 key decision 2: the database itself guarantees a host can never hold two
-- overlapping live bookings, even when concurrent requests race for the same slot.
-- Ranges are half-open [start, end) so back-to-back meetings (10:00–10:30, 10:30–11:00) are allowed.
-- Cancelled bookings are excluded so their slot frees up immediately (F5.2).
-- Buffers are enforced in the slot engine, not here, because they can change after booking.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "user_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" <> 'cancelled');
