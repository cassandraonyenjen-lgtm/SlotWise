import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db";
import { bookingAnswers, bookings, customQuestions } from "@/db/schema";

/** Everything an email about one booking needs, loaded in one place. */
export async function loadBookingContext(db: Database, bookingId: string) {
  const booking = await db.query.bookings.findFirst({
    where: eq(bookings.id, bookingId),
    with: {
      user: {
        columns: {
          username: true,
          name: true,
          email: true,
          timezone: true,
          logoUrl: true,
          reminderPolicy: true,
        },
      },
      meetingType: { columns: { name: true, locationType: true, locationValue: true } },
    },
  });
  if (!booking) return null;

  const answers = await db
    .select({ label: customQuestions.label, answer: bookingAnswers.answer })
    .from(bookingAnswers)
    .innerJoin(customQuestions, eq(customQuestions.id, bookingAnswers.questionId))
    .where(eq(bookingAnswers.bookingId, bookingId))
    .orderBy(asc(customQuestions.position));

  const { user: host, meetingType, ...rest } = booking;
  return { booking: rest, host, meetingType, answers };
}

export type BookingContext = NonNullable<Awaited<ReturnType<typeof loadBookingContext>>>;
