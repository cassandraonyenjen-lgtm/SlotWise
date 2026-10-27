/** Data export and account deletion (PRD §8 Privacy: GDPR/NDPR-aware). */
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { Database } from "@/db";
import {
  availabilityRules,
  bookingAnswers,
  bookingEvents,
  bookings,
  customQuestions,
  dateOverrides,
  emailLog,
  meetingTypes,
  users,
} from "@/db/schema";
import { sendBookingNotifications } from "@/features/emails/send";
import type { EmailTransport } from "@/features/emails/transport";

/**
 * Everything Slotwise stores about a host, as one JSON-ready object. Secrets (manage-token
 * hashes, auth sessions and OAuth tokens) are left out.
 */
export async function exportAccount(db: Database, userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      timezone: users.timezone,
      logoUrl: users.logoUrl,
      reminderPolicy: users.reminderPolicy,
      cancelCutoffMin: users.cancelCutoffMin,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return null;

  const [types, rules, overrides, bookingRows] = await Promise.all([
    db.query.meetingTypes.findMany({
      where: eq(meetingTypes.userId, userId),
      with: { questions: { orderBy: [asc(customQuestions.position)] } },
      orderBy: [asc(meetingTypes.createdAt)],
    }),
    db.select().from(availabilityRules).where(eq(availabilityRules.userId, userId)),
    db.select().from(dateOverrides).where(eq(dateOverrides.userId, userId)),
    db
      .select({
        id: bookings.id,
        meetingTypeId: bookings.meetingTypeId,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        status: bookings.status,
        inviteeName: bookings.inviteeName,
        inviteeEmail: bookings.inviteeEmail,
        inviteeTimezone: bookings.inviteeTimezone,
        notes: bookings.notes,
        cancelReason: bookings.cancelReason,
        cancelledBy: bookings.cancelledBy,
        cancelledAt: bookings.cancelledAt,
        createdAt: bookings.createdAt,
      })
      .from(bookings)
      .where(eq(bookings.userId, userId))
      .orderBy(asc(bookings.startAt)),
  ]);

  const ids = bookingRows.map((b) => b.id);
  const [answers, events, emails] = ids.length
    ? await Promise.all([
        db.select().from(bookingAnswers).where(inArray(bookingAnswers.bookingId, ids)),
        db.select().from(bookingEvents).where(inArray(bookingEvents.bookingId, ids)),
        db
          .select({
            bookingId: emailLog.bookingId,
            type: emailLog.type,
            recipient: emailLog.recipient,
            status: emailLog.status,
            sentAt: emailLog.sentAt,
          })
          .from(emailLog)
          .where(inArray(emailLog.bookingId, ids)),
      ])
    : [[], [], []];

  return {
    exportedAt: new Date().toISOString(),
    account: user,
    meetingTypes: types,
    availability: { weekly: rules, dateOverrides: overrides },
    bookings: bookingRows.map((b) => ({
      ...b,
      answers: answers.filter((a) => a.bookingId === b.id),
      history: events.filter((e) => e.bookingId === b.id),
      emails: emails.filter((e) => e.bookingId === b.id),
    })),
  };
}

/**
 * Deletes a host and everything they own. Invitees with upcoming meetings are emailed a
 * cancellation first, since the host won't be there. Returns how many were notified.
 */
export async function deleteAccount(
  db: Database,
  transport: EmailTransport,
  userId: string,
  now = new Date(),
): Promise<{ cancelled: number }> {
  const upcoming = await db
    .select({ id: bookings.id, icsSequence: bookings.icsSequence })
    .from(bookings)
    .where(
      and(eq(bookings.userId, userId), eq(bookings.status, "confirmed"), gt(bookings.startAt, now)),
    );

  for (const b of upcoming) {
    await db
      .update(bookings)
      .set({
        status: "cancelled",
        cancelledBy: "host",
        cancelledAt: now,
        cancelReason: "The host has closed their Slotwise account.",
        icsSequence: b.icsSequence + 1,
      })
      .where(eq(bookings.id, b.id));
    try {
      await sendBookingNotifications(db, transport, "cancelled", b.id);
    } catch {
      // A failed email must not keep someone's data around; carry on deleting.
    }
  }

  await db.transaction(async (tx) => {
    // Bookings first: they hold a RESTRICT reference to meeting types.
    await tx.delete(bookings).where(eq(bookings.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });
  return { cancelled: upcoming.length };
}
