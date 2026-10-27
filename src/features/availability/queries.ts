/**
 * Database access for availability. Takes `db` as an argument (rather than importing the
 * app singleton) so the same code runs in server actions and in the DB test suite.
 */
import { and, asc, eq, gt, gte, inArray, lt, lte, ne } from "drizzle-orm";
import type { Database } from "@/db";
import { availabilityRules, bookings, dateOverrides, meetingTypes, users } from "@/db/schema";
import type { DateOverrideInput, WeeklyHoursInput } from "./schemas";
import { computeSlots, isSlotAvailable } from "./slots";
import { addLocalDays, localDateOf, toWallTime, wallTimeToMinutes } from "./time";
import type { DateOverride, Slot, SlotQuery, TimeRange, WeeklyRange } from "./types";

/** Mon–Fri 09:00–17:00, given to every new host so their page works on day one. */
export const DEFAULT_WEEKLY_HOURS: WeeklyRange[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  start: "09:00",
  end: "17:00",
}));

export interface HostAvailability {
  timezone: string;
  weekly: WeeklyRange[];
  /** Overrides from the host's today onward, one entry per date. */
  overrides: DateOverride[];
}

export async function getAvailability(db: Database, userId: string, now = new Date()) {
  const user = await db.query.users.findFirst({
    columns: { timezone: true },
    where: eq(users.id, userId),
  });
  if (!user) throw new Error("User not found");

  const today = localDateOf(now, user.timezone);
  const [rules, overrideRows] = await Promise.all([
    db
      .select()
      .from(availabilityRules)
      .where(eq(availabilityRules.userId, userId))
      .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startTime)),
    db
      .select()
      .from(dateOverrides)
      .where(and(eq(dateOverrides.userId, userId), gte(dateOverrides.date, today)))
      .orderBy(asc(dateOverrides.date), asc(dateOverrides.startTime)),
  ]);

  return {
    timezone: user.timezone,
    weekly: rules.map((r) => ({
      weekday: r.weekday,
      start: toWallTime(r.startTime),
      end: toWallTime(r.endTime),
    })),
    overrides: toOverrides(overrideRows),
  } satisfies HostAvailability;
}

export async function setTimezone(db: Database, userId: string, timezone: string) {
  await db.update(users).set({ timezone }).where(eq(users.id, userId));
}

/** Replaces the host's whole weekly schedule in one transaction. */
export async function saveWeeklyHours(db: Database, userId: string, input: WeeklyHoursInput) {
  const rows = input.days.flatMap((ranges, weekday) =>
    ranges.map((r) => ({ userId, weekday, startTime: r.start, endTime: r.end })),
  );
  await db.transaction(async (tx) => {
    await tx.delete(availabilityRules).where(eq(availabilityRules.userId, userId));
    if (rows.length) await tx.insert(availabilityRules).values(rows);
  });
}

export async function seedDefaultAvailability(db: Database, userId: string) {
  await db.insert(availabilityRules).values(
    DEFAULT_WEEKLY_HOURS.map((r) => ({
      userId,
      weekday: r.weekday,
      startTime: r.start,
      endTime: r.end,
    })),
  );
}

/** Blocking or setting hours for a date replaces whatever override that date had. */
export async function saveDateOverride(db: Database, userId: string, input: DateOverrideInput) {
  const dates = input.kind === "unavailable" ? dateSpan(input.from, input.to) : [input.date];
  const rows =
    input.kind === "unavailable"
      ? dates.map((date) => ({ userId, date, isUnavailable: true }))
      : input.ranges.map((r) => ({
          userId,
          date: input.date,
          isUnavailable: false,
          startTime: r.start,
          endTime: r.end,
        }));

  await db.transaction(async (tx) => {
    await tx
      .delete(dateOverrides)
      .where(and(eq(dateOverrides.userId, userId), inArray(dateOverrides.date, dates)));
    await tx.insert(dateOverrides).values(rows);
  });
}

export async function removeDateOverride(db: Database, userId: string, date: string) {
  await db
    .delete(dateOverrides)
    .where(and(eq(dateOverrides.userId, userId), eq(dateOverrides.date, date)));
}

export interface FlaggedBooking {
  id: string;
  startAt: Date;
  inviteeName: string;
  date: string;
}

/**
 * Upcoming bookings that fall on a date the host has since blocked. They are flagged for
 * the host to handle, never cancelled automatically (F1.2).
 */
export async function findBookingsOnBlockedDates(
  db: Database,
  userId: string,
  now = new Date(),
): Promise<FlaggedBooking[]> {
  const { timezone, overrides } = await getAvailability(db, userId, now);
  const blocked = new Set(overrides.filter((o) => o.isUnavailable).map((o) => o.date));
  if (blocked.size === 0) return [];

  const upcoming = await db
    .select({
      id: bookings.id,
      startAt: bookings.startAt,
      inviteeName: bookings.inviteeName,
    })
    .from(bookings)
    .where(
      and(eq(bookings.userId, userId), eq(bookings.status, "confirmed"), gt(bookings.startAt, now)),
    )
    .orderBy(asc(bookings.startAt));

  return upcoming
    .map((b) => ({ ...b, date: localDateOf(b.startAt, timezone) }))
    .filter((b) => blocked.has(b.date));
}

/**
 * Everything computeSlots needs for one meeting type, or null if it can't be booked
 * (missing or disabled).
 */
export async function loadSlotQuery(
  db: Database,
  meetingTypeId: string,
  from: Date,
  to: Date,
  now = new Date(),
): Promise<SlotQuery | null> {
  const meetingType = await db.query.meetingTypes.findFirst({
    where: and(eq(meetingTypes.id, meetingTypeId), eq(meetingTypes.isActive, true)),
    with: { user: { columns: { id: true, timezone: true } } },
  });
  if (!meetingType) return null;

  const { user } = meetingType;
  const tz = user.timezone;
  const firstDate = addLocalDays(localDateOf(from, tz), -1);
  const lastDate = addLocalDays(localDateOf(to, tz), 1);
  // Busy window: wide enough for buffers and for counting whole host-local days (daily cap).
  const busyFrom = new Date(from.getTime() - 2 * 86_400_000);
  const busyTo = new Date(to.getTime() + 2 * 86_400_000);

  const [rules, overrideRows, busy] = await Promise.all([
    db.select().from(availabilityRules).where(eq(availabilityRules.userId, user.id)),
    db
      .select()
      .from(dateOverrides)
      .where(
        and(
          eq(dateOverrides.userId, user.id),
          gte(dateOverrides.date, firstDate),
          lte(dateOverrides.date, lastDate),
        ),
      ),
    db
      .select({ startAt: bookings.startAt, endAt: bookings.endAt })
      .from(bookings)
      .where(
        and(
          eq(bookings.userId, user.id),
          ne(bookings.status, "cancelled"),
          lt(bookings.startAt, busyTo),
          gt(bookings.endAt, busyFrom),
        ),
      ),
  ]);

  return {
    hostTimezone: tz,
    weekly: rules.map((r) => ({
      weekday: r.weekday,
      start: toWallTime(r.startTime),
      end: toWallTime(r.endTime),
    })),
    overrides: toOverrides(overrideRows),
    rules: {
      durationMin: meetingType.durationMin,
      bufferBeforeMin: meetingType.bufferBeforeMin,
      bufferAfterMin: meetingType.bufferAfterMin,
      minNoticeMin: meetingType.minNoticeMin,
      maxDaysAhead: meetingType.maxDaysAhead,
      dailyLimit: meetingType.dailyLimit,
    },
    busy,
    from,
    to,
    now,
  };
}

export async function getSlots(
  db: Database,
  meetingTypeId: string,
  from: Date,
  to: Date,
  now = new Date(),
): Promise<Slot[]> {
  const query = await loadSlotQuery(db, meetingTypeId, from, to, now);
  return query ? computeSlots(query) : [];
}

/**
 * Server-side re-check before a booking is written (F1.5): the start must still be a slot
 * we'd offer now. The exclusion constraint separately guards against concurrent inserts.
 */
export async function isStartBookable(
  db: Database,
  meetingTypeId: string,
  startAt: Date,
  now = new Date(),
): Promise<boolean> {
  const query = await loadSlotQuery(
    db,
    meetingTypeId,
    startAt,
    new Date(startAt.getTime() + 60_000),
    now,
  );
  return query ? isSlotAvailable(query, startAt) : false;
}

type OverrideRow = typeof dateOverrides.$inferSelect;

function toOverrides(rows: OverrideRow[]): DateOverride[] {
  const byDate = new Map<string, OverrideRow[]>();
  for (const row of rows) byDate.set(row.date, [...(byDate.get(row.date) ?? []), row]);

  return [...byDate.entries()].map(([date, group]): DateOverride => {
    if (group.some((r) => r.isUnavailable)) return { date, isUnavailable: true };
    const ranges: TimeRange[] = group
      .flatMap((r) =>
        r.startTime && r.endTime
          ? [{ start: toWallTime(r.startTime), end: toWallTime(r.endTime) }]
          : [],
      )
      .sort((a, b) => wallTimeToMinutes(a.start) - wallTimeToMinutes(b.start));
    return { date, isUnavailable: false, ranges };
  });
}

function dateSpan(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addLocalDays(d, 1)) dates.push(d);
  return dates;
}
