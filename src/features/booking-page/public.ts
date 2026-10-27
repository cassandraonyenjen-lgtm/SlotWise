/** Public (no sign-in) reads and the booking write. Takes `db` so DB tests can call it directly. */
import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db";
import {
  bookingAnswers,
  bookingEvents,
  bookings,
  customQuestions,
  meetingTypes,
  users,
} from "@/db/schema";
import { computeSlots, isSlotAvailable } from "@/features/availability/slots";
import { loadSlotQuery } from "@/features/availability/queries";
import { isReservedUsername } from "@/lib/usernames";
import { hashManageToken, manageTokenFor } from "@/lib/tokens";
import { isSlotTakenError } from "./errors";
import type { bookingRequestSchema } from "./schemas";
import type { z } from "zod";

const DAY = 86_400_000;
/** Largest window one slots request may ask for, to keep the public endpoint cheap. */
export const MAX_SLOT_WINDOW_DAYS = 62;

export async function getPublicHost(db: Database, username: string) {
  if (isReservedUsername(username)) return null;
  const host = await db.query.users.findFirst({
    columns: { id: true, name: true, username: true, timezone: true, logoUrl: true },
    where: eq(users.username, username.toLowerCase()),
  });
  if (!host) return null;
  const types = await db
    .select({
      slug: meetingTypes.slug,
      name: meetingTypes.name,
      durationMin: meetingTypes.durationMin,
      description: meetingTypes.description,
      locationType: meetingTypes.locationType,
    })
    .from(meetingTypes)
    .where(and(eq(meetingTypes.userId, host.id), eq(meetingTypes.isActive, true)))
    .orderBy(asc(meetingTypes.createdAt));
  return { host, meetingTypes: types };
}

/** An active meeting type by its public URL, with its questions. Never exposes internal ids. */
export async function getPublicMeetingType(db: Database, username: string, slug: string) {
  if (isReservedUsername(username)) return null;
  const host = await db.query.users.findFirst({
    columns: { id: true, name: true, username: true, timezone: true },
    where: eq(users.username, username.toLowerCase()),
  });
  if (!host) return null;
  const meetingType = await db.query.meetingTypes.findFirst({
    where: and(
      eq(meetingTypes.userId, host.id),
      eq(meetingTypes.slug, slug.toLowerCase()),
      eq(meetingTypes.isActive, true),
    ),
    with: { questions: { orderBy: [asc(customQuestions.position)] } },
  });
  if (!meetingType) return null;
  return { host, meetingType };
}

export async function getPublicSlots(
  db: Database,
  username: string,
  slug: string,
  from: Date,
  to: Date,
  now = new Date(),
) {
  const found = await getPublicMeetingType(db, username, slug);
  if (!found) return null;
  const clampedTo = new Date(Math.min(to.getTime(), from.getTime() + MAX_SLOT_WINDOW_DAYS * DAY));
  const query = await loadSlotQuery(db, found.meetingType.id, from, clampedTo, now);
  return query ? computeSlots(query) : [];
}

export type CreateBookingResult =
  | {
      ok: true;
      booking: typeof bookings.$inferSelect;
      /** The raw manage token for the invitee's links. Never stored; see manageTokenFor. */
      manageToken: string;
      host: { name: string | null; email: string; timezone: string };
      meetingType: { name: string; locationType: string; locationValue: string | null };
    }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "taken" }
  | { ok: false; reason: "invalid"; error: string; field?: string };

/**
 * Books a slot (F2.4, F2.6). The start is re-checked against current availability and rules
 * (F1.5), then inserted; if another request won the race, the exclusion constraint rejects
 * this one and we report "taken".
 */
export async function createBooking(
  db: Database,
  request: z.output<typeof bookingRequestSchema>,
  now = new Date(),
): Promise<CreateBookingResult> {
  const found = await getPublicMeetingType(db, request.username, request.slug);
  if (!found) return { ok: false, reason: "not_found" };
  const { meetingType } = found;

  const missing = meetingType.questions.find((q) => q.required && !request.answers[q.id]?.trim());
  if (missing) {
    return {
      ok: false,
      reason: "invalid",
      error: `Please answer "${missing.label}"`,
      field: `answers.${missing.id}`,
    };
  }

  const startAt = request.startAt;
  const query = await loadSlotQuery(
    db,
    meetingType.id,
    startAt,
    new Date(startAt.getTime() + 60_000),
    now,
  );
  if (!query || !isSlotAvailable(query, startAt)) return { ok: false, reason: "taken" };

  const endAt = new Date(startAt.getTime() + meetingType.durationMin * 60_000);
  const bookingId = crypto.randomUUID();
  const token = manageTokenFor(bookingId);

  try {
    const booking = await db.transaction(async (tx) => {
      // Queue concurrent bookings for the same host. Without this, racing inserts can
      // deadlock inside the exclusion check, and Postgres only breaks each deadlock after
      // deadlock_timeout (1s). The constraint is still what guarantees no double-booking.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${found.host.id}, 0))`);
      const [row] = await tx
        .insert(bookings)
        .values({
          id: bookingId,
          userId: found.host.id,
          meetingTypeId: meetingType.id,
          startAt,
          endAt,
          inviteeName: request.inviteeName,
          inviteeEmail: request.inviteeEmail,
          inviteeTimezone: request.inviteeTimezone,
          notes: request.notes,
          manageTokenHash: hashManageToken(token),
          icsUid: `${crypto.randomUUID()}@slotwise.app`,
        })
        .returning();
      const answers = meetingType.questions
        .map((q) => ({ questionId: q.id, answer: request.answers[q.id]?.trim() ?? "" }))
        .filter((a) => a.answer);
      if (answers.length) {
        await tx.insert(bookingAnswers).values(answers.map((a) => ({ ...a, bookingId: row!.id })));
      }
      await tx
        .insert(bookingEvents)
        .values({ bookingId: row!.id, type: "created", actor: "invitee" });
      return row!;
    });

    const host = await db.query.users.findFirst({
      columns: { name: true, email: true, timezone: true },
      where: eq(users.id, found.host.id),
    });
    return {
      ok: true,
      booking,
      manageToken: token,
      host: host!,
      meetingType: {
        name: meetingType.name,
        locationType: meetingType.locationType,
        locationValue: meetingType.locationValue,
      },
    };
  } catch (error) {
    if (isSlotTakenError(error)) return { ok: false, reason: "taken" };
    throw error;
  }
}
