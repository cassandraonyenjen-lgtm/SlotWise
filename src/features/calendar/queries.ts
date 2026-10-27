/** Host dashboard reads (F3). Every query is scoped to the signed-in host's user id. */
import { and, asc, desc, eq, gt, gte, lt, lte, ne } from "drizzle-orm";
import type { Database } from "@/db";
import {
  availabilityRules,
  bookingAnswers,
  bookingEvents,
  bookings,
  customQuestions,
  dateOverrides,
  meetingTypes,
  users,
} from "@/db/schema";
import { addLocalDays, localDateOf, toWallTime } from "@/features/availability/time";
import { toFloating } from "./floating";

export interface CalendarBooking {
  id: string;
  title: string;
  /** Floating host-local times; see floating.ts. */
  start: string;
  end: string;
  status: "confirmed" | "no_show";
}

export interface CalendarBlock {
  date: string;
  /** null for a full-day block; otherwise the custom hours that replace the weekly ones. */
  hours: { start: string; end: string } | null;
}

export interface CalendarData {
  timezone: string;
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
}

/** Bookings and date overrides between two instants, in the host's zone (F3.1, F3.4). */
export async function getCalendarData(
  db: Database,
  userId: string,
  from: Date,
  to: Date,
): Promise<CalendarData> {
  const tz = await hostTimezone(db, userId);
  const [rows, overrides] = await Promise.all([
    db
      .select({
        id: bookings.id,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        status: bookings.status,
        inviteeName: bookings.inviteeName,
        meetingType: meetingTypes.name,
      })
      .from(bookings)
      .innerJoin(meetingTypes, eq(meetingTypes.id, bookings.meetingTypeId))
      .where(
        and(
          eq(bookings.userId, userId),
          ne(bookings.status, "cancelled"),
          lt(bookings.startAt, to),
          gt(bookings.endAt, from),
        ),
      )
      .orderBy(asc(bookings.startAt)),
    db
      .select()
      .from(dateOverrides)
      .where(
        and(
          eq(dateOverrides.userId, userId),
          gte(dateOverrides.date, addLocalDays(localDateOf(from, tz), -1)),
          lte(dateOverrides.date, addLocalDays(localDateOf(to, tz), 1)),
        ),
      )
      .orderBy(asc(dateOverrides.date)),
  ]);

  return {
    timezone: tz,
    bookings: rows.map((b) => ({
      id: b.id,
      title: `${b.inviteeName} · ${b.meetingType}`,
      start: toFloating(b.startAt, tz),
      end: toFloating(b.endAt, tz),
      status: b.status === "no_show" ? "no_show" : "confirmed",
    })),
    blocks: overrides.map((o) => ({
      date: o.date,
      hours:
        o.isUnavailable || !o.startTime || !o.endTime
          ? null
          : { start: toWallTime(o.startTime), end: toWallTime(o.endTime) },
    })),
  };
}

/** Weekly hours as FullCalendar business hours, so time outside them is shaded. */
export async function getBusinessHours(db: Database, userId: string) {
  const rules = await db
    .select()
    .from(availabilityRules)
    .where(eq(availabilityRules.userId, userId));
  return rules.map((r) => ({
    daysOfWeek: [r.weekday],
    startTime: toWallTime(r.startTime),
    endTime: toWallTime(r.endTime),
  }));
}

/** Everything the details panel shows (F3.2), or null if it isn't this host's booking. */
export async function getBookingDetail(db: Database, userId: string, bookingId: string) {
  const booking = await db.query.bookings.findFirst({
    where: and(eq(bookings.id, bookingId), eq(bookings.userId, userId)),
    with: {
      meetingType: {
        columns: { name: true, locationType: true, locationValue: true, maxDaysAhead: true },
      },
      events: { orderBy: [desc(bookingEvents.createdAt)] },
    },
  });
  if (!booking) return null;
  const answers = await db
    .select({ label: customQuestions.label, answer: bookingAnswers.answer })
    .from(bookingAnswers)
    .innerJoin(customQuestions, eq(customQuestions.id, bookingAnswers.questionId))
    .where(eq(bookingAnswers.bookingId, bookingId))
    .orderBy(asc(customQuestions.position));
  return { ...booking, answers };
}

export type BookingDetail = NonNullable<Awaited<ReturnType<typeof getBookingDetail>>>;

/** Today's meetings and the next few after, for the dashboard home (F3 "Today" summary). */
export async function getTodaySummary(db: Database, userId: string, now = new Date()) {
  const tz = await hostTimezone(db, userId);
  const today = localDateOf(now, tz);
  const upcoming = await db
    .select({
      id: bookings.id,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      status: bookings.status,
      inviteeName: bookings.inviteeName,
      meetingType: meetingTypes.name,
    })
    .from(bookings)
    .innerJoin(meetingTypes, eq(meetingTypes.id, bookings.meetingTypeId))
    .where(
      and(
        eq(bookings.userId, userId),
        ne(bookings.status, "cancelled"),
        // From the start of today, so this morning's meetings still show.
        gt(bookings.endAt, new Date(now.getTime() - 24 * 3_600_000)),
      ),
    )
    .orderBy(asc(bookings.startAt))
    .limit(50);

  const isToday = (b: { startAt: Date }) => localDateOf(b.startAt, tz) === today;
  return {
    timezone: tz,
    today: upcoming.filter(isToday),
    next: upcoming.filter((b) => !isToday(b) && b.startAt > now).slice(0, 5),
  };
}

export async function hostTimezone(db: Database, userId: string) {
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  return row?.timezone ?? "UTC";
}
