/** Reschedule, cancel and no-show (F5, F3.5). Takes `db` so DB tests can call it directly. */
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { bookingEvents, bookings } from "@/db/schema";
import { loadSlotQuery } from "@/features/availability/queries";
import { computeSlots, isSlotAvailable } from "@/features/availability/slots";
import { isSlotTakenError } from "@/features/booking-page/errors";
import { lockHostBookings } from "@/features/booking-page/locks";
import { hashManageToken } from "@/lib/tokens";

const MINUTE = 60_000;

/**
 * What an invitee's manage link may do right now. Links stop working once the meeting has
 * started (F5.5); inside the host's cutoff they only show who to contact (F5.4).
 */
export type ManageState = "active" | "within_cutoff" | "cancelled" | "past";

export function manageState(
  booking: { status: string; startAt: Date },
  cancelCutoffMin: number,
  now: Date,
): ManageState {
  if (booking.status === "cancelled") return "cancelled";
  if (booking.status === "no_show" || booking.startAt.getTime() <= now.getTime()) return "past";
  if (booking.startAt.getTime() - now.getTime() < cancelCutoffMin * MINUTE) return "within_cutoff";
  return "active";
}

/** The booking behind a manage link, or null. Only the token's hash is ever compared. */
export async function findBookingByManageToken(db: Database, token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null;
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.manageTokenHash, hashManageToken(token)),
    with: {
      user: {
        columns: { name: true, username: true, email: true, timezone: true, cancelCutoffMin: true },
      },
      meetingType: {
        columns: {
          id: true,
          name: true,
          durationMin: true,
          maxDaysAhead: true,
          locationType: true,
          locationValue: true,
        },
      },
    },
  });
  if (!booking) return null;
  const { user: host, meetingType, ...rest } = booking;
  return {
    booking: rest,
    host,
    meetingType,
    state: manageState(rest, host.cancelCutoffMin, now),
  };
}

/** Who is making the change. Hosts may only touch their own bookings. */
export type Actor = { kind: "invitee" } | { kind: "host"; userId: string };

export type ChangeResult =
  | {
      ok: true;
      bookingId: string;
      /** ics_sequence after the change, for emails and reminder jobs. */
      sequence: number;
      previousStartAt: Date;
      previousEndAt: Date;
    }
  | { ok: false; reason: "not_found" | "not_allowed" | "taken"; error: string };

const NOT_FOUND = { ok: false, reason: "not_found", error: "This booking wasn't found." } as const;

async function loadForChange(db: Database, bookingId: string, actor: Actor) {
  const booking = await db.query.bookings.findFirst({
    where:
      actor.kind === "host"
        ? and(eq(bookings.id, bookingId), eq(bookings.userId, actor.userId))
        : eq(bookings.id, bookingId),
    with: {
      user: { columns: { cancelCutoffMin: true } },
      meetingType: { columns: { durationMin: true } },
    },
  });
  return booking ?? null;
}

/** Why this actor can't change the booking now, or null if they can. */
function blockedReason(
  booking: { status: string; startAt: Date },
  cutoffMin: number,
  actor: Actor,
  now: Date,
): string | null {
  const state = manageState(booking, cutoffMin, now);
  if (state === "cancelled") return "This booking has already been cancelled.";
  if (state === "past") return "This meeting has already started, so it can't be changed.";
  // The cutoff only limits invitees; hosts can always handle conflicts (F5.3).
  if (state === "within_cutoff" && actor.kind === "invitee") {
    return "It's too close to the meeting to change it online. Please contact your host directly.";
  }
  return null;
}

export async function cancelBooking(
  db: Database,
  input: { bookingId: string; actor: Actor; reason?: string | null; now?: Date },
): Promise<ChangeResult> {
  const now = input.now ?? new Date();
  const booking = await loadForChange(db, input.bookingId, input.actor);
  if (!booking) return NOT_FOUND;
  const blocked = blockedReason(booking, booking.user.cancelCutoffMin, input.actor, now);
  if (blocked) return { ok: false, reason: "not_allowed", error: blocked };

  const reason = input.reason?.trim() || null;
  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(bookings)
      .set({
        status: "cancelled",
        cancelReason: reason,
        cancelledBy: input.actor.kind,
        cancelledAt: now,
        icsSequence: booking.icsSequence + 1,
        updatedAt: now,
      })
      // Only if nothing changed since we checked, so two cancels can't both win.
      .where(
        and(
          eq(bookings.id, booking.id),
          eq(bookings.status, "confirmed"),
          eq(bookings.icsSequence, booking.icsSequence),
        ),
      )
      .returning({ sequence: bookings.icsSequence });
    if (!row) return null;
    await tx.insert(bookingEvents).values({
      bookingId: booking.id,
      type: "cancelled",
      actor: input.actor.kind,
      data: reason ? { reason } : null,
    });
    return row;
  });
  if (!updated) {
    return {
      ok: false,
      reason: "not_allowed",
      error: "This booking just changed. Refresh and try again.",
    };
  }
  return {
    ok: true,
    bookingId: booking.id,
    sequence: updated.sequence,
    previousStartAt: booking.startAt,
    previousEndAt: booking.endAt,
  };
}

/**
 * Moves a booking in place (F5.1, F5.3): same row, same ICS UID, bumped sequence. The new
 * time must be a slot we'd offer now, counting the booking's current time as free.
 */
export async function rescheduleBooking(
  db: Database,
  input: {
    bookingId: string;
    actor: Actor;
    startAt: Date;
    message?: string | null;
    now?: Date;
  },
): Promise<ChangeResult> {
  const now = input.now ?? new Date();
  const booking = await loadForChange(db, input.bookingId, input.actor);
  if (!booking) return NOT_FOUND;
  const blocked = blockedReason(booking, booking.user.cancelCutoffMin, input.actor, now);
  if (blocked) return { ok: false, reason: "not_allowed", error: blocked };
  if (input.startAt.getTime() === booking.startAt.getTime()) {
    return {
      ok: false,
      reason: "not_allowed",
      error: "Pick a different time from the current one.",
    };
  }

  const query = await loadSlotQuery(
    db,
    booking.meetingTypeId,
    input.startAt,
    new Date(input.startAt.getTime() + MINUTE),
    now,
    { excludeBookingId: booking.id, includeInactive: input.actor.kind === "host" },
  );
  const taken = {
    ok: false,
    reason: "taken",
    error: "That time is no longer available. Please pick another.",
  } as const;
  if (!query || !isSlotAvailable(query, input.startAt)) return taken;

  const endAt = new Date(input.startAt.getTime() + booking.meetingType.durationMin * MINUTE);
  const message = input.message?.trim() || null;
  try {
    const updated = await db.transaction(async (tx) => {
      await lockHostBookings(tx, booking.userId);
      const [row] = await tx
        .update(bookings)
        .set({
          startAt: input.startAt,
          endAt,
          icsSequence: booking.icsSequence + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(bookings.id, booking.id),
            eq(bookings.status, "confirmed"),
            eq(bookings.icsSequence, booking.icsSequence),
          ),
        )
        .returning({ sequence: bookings.icsSequence });
      if (!row) return null;
      await tx.insert(bookingEvents).values({
        bookingId: booking.id,
        type: "rescheduled",
        actor: input.actor.kind,
        data: {
          fromStartAt: booking.startAt.toISOString(),
          toStartAt: input.startAt.toISOString(),
          ...(message ? { message } : {}),
        },
      });
      return row;
    });
    if (!updated) {
      return {
        ok: false,
        reason: "not_allowed",
        error: "This booking just changed. Refresh and try again.",
      };
    }
    return {
      ok: true,
      bookingId: booking.id,
      sequence: updated.sequence,
      previousStartAt: booking.startAt,
      previousEndAt: booking.endAt,
    };
  } catch (error) {
    if (isSlotTakenError(error)) return taken;
    throw error;
  }
}

/** Records a no-show (F3.5). Only for a confirmed booking whose start has passed. */
export async function markNoShow(
  db: Database,
  input: { bookingId: string; userId: string; now?: Date },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = input.now ?? new Date();
  const booking = await loadForChange(db, input.bookingId, { kind: "host", userId: input.userId });
  if (!booking) return { ok: false, error: NOT_FOUND.error };
  if (booking.status !== "confirmed")
    return { ok: false, error: "Only confirmed bookings can be marked." };
  if (booking.startAt.getTime() > now.getTime()) {
    return { ok: false, error: "You can mark a no-show once the meeting has started." };
  }
  await db.transaction(async (tx) => {
    await tx
      .update(bookings)
      .set({ status: "no_show", updatedAt: now })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed")));
    await tx
      .insert(bookingEvents)
      .values({ bookingId: booking.id, type: "marked_no_show", actor: "host" });
  });
  return { ok: true };
}

const MAX_WINDOW = 62 * 86_400_000;

/** Times a booking could move to, with its own current time counted as free. */
export async function getRescheduleSlots(
  db: Database,
  input: { bookingId: string; actor: Actor; from: Date; to: Date; now?: Date },
): Promise<Date[] | null> {
  const now = input.now ?? new Date();
  const booking = await loadForChange(db, input.bookingId, input.actor);
  if (!booking) return null;
  if (blockedReason(booking, booking.user.cancelCutoffMin, input.actor, now)) return [];
  const to = new Date(Math.min(input.to.getTime(), input.from.getTime() + MAX_WINDOW));
  const query = await loadSlotQuery(db, booking.meetingTypeId, input.from, to, now, {
    excludeBookingId: booking.id,
    includeInactive: input.actor.kind === "host",
  });
  if (!query) return [];
  return computeSlots(query)
    .map((s) => s.startAt)
    .filter((s) => s.getTime() !== booking.startAt.getTime());
}
