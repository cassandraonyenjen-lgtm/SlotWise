/** Availability queries against a real Postgres: persistence, overrides, and slot loading. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import {
  findBookingsOnBlockedDates,
  getAvailability,
  getSlots,
  isStartBookable,
  removeDateOverride,
  saveDateOverride,
  saveWeeklyHours,
  seedDefaultAvailability,
} from "@/features/availability/queries";
import { generateManageToken } from "@/lib/tokens";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must point at a migrated test database");

const client = postgres(url, { max: 5, onnotice: () => {} });
const db = drizzle(client, { schema });

let userId: string;
let meetingTypeId: string;

// Monday 5 Jan 2026, 06:00 in Lagos (UTC+1).
const NOW = new Date("2026-01-05T05:00:00Z");
const week = () => Array.from({ length: 7 }, () => [] as { start: string; end: string }[]);

beforeAll(async () => {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `avail-${crypto.randomUUID()}@example.com`, timezone: "Africa/Lagos" })
    .returning();
  userId = user!.id;
  const [mt] = await db
    .insert(schema.meetingTypes)
    .values({
      userId,
      slug: "intro",
      name: "Intro",
      durationMin: 30,
      locationType: "video_link",
      minNoticeMin: 0,
      maxDaysAhead: 30,
    })
    .returning();
  meetingTypeId = mt!.id;
});

beforeEach(async () => {
  await db.delete(schema.bookings).where(eq(schema.bookings.userId, userId));
  await db.delete(schema.dateOverrides).where(eq(schema.dateOverrides.userId, userId));
  await db.delete(schema.availabilityRules).where(eq(schema.availabilityRules.userId, userId));
});

afterAll(async () => {
  if (userId) {
    await db.delete(schema.bookings).where(eq(schema.bookings.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  }
  await client.end();
});

describe("availability persistence", () => {
  it("seeds Mon–Fri 09:00–17:00 for a new host", async () => {
    await seedDefaultAvailability(db, userId);
    const { weekly } = await getAvailability(db, userId, NOW);
    expect(weekly).toHaveLength(5);
    expect(weekly[0]).toEqual({ weekday: 1, start: "09:00", end: "17:00" });
  });

  it("replaces the weekly schedule on save", async () => {
    await seedDefaultAvailability(db, userId);
    const days = week();
    days[2] = [
      { start: "08:00", end: "12:00" },
      { start: "13:00", end: "16:30" },
    ];
    await saveWeeklyHours(db, userId, { days });
    const { weekly } = await getAvailability(db, userId, NOW);
    expect(weekly).toEqual([
      { weekday: 2, start: "08:00", end: "12:00" },
      { weekday: 2, start: "13:00", end: "16:30" },
    ]);
  });

  it("blocks a span of dates and replaces earlier overrides on those dates", async () => {
    await saveDateOverride(db, userId, {
      kind: "hours",
      date: "2026-01-07",
      ranges: [{ start: "18:00", end: "19:00" }],
    });
    await saveDateOverride(db, userId, {
      kind: "unavailable",
      from: "2026-01-06",
      to: "2026-01-08",
    });
    const { overrides } = await getAvailability(db, userId, NOW);
    expect(overrides).toEqual([
      { date: "2026-01-06", isUnavailable: true },
      { date: "2026-01-07", isUnavailable: true },
      { date: "2026-01-08", isUnavailable: true },
    ]);
    await removeDateOverride(db, userId, "2026-01-07");
    expect((await getAvailability(db, userId, NOW)).overrides.map((o) => o.date)).toEqual([
      "2026-01-06",
      "2026-01-08",
    ]);
  });

  it("hides past overrides", async () => {
    await saveDateOverride(db, userId, {
      kind: "unavailable",
      from: "2026-01-01",
      to: "2026-01-01",
    });
    expect((await getAvailability(db, userId, NOW)).overrides).toEqual([]);
  });
});

describe("slots from the database", () => {
  const monday = { from: new Date("2026-01-05T00:00:00Z"), to: new Date("2026-01-06T00:00:00Z") };

  it("uses the host's zone, overrides and bookings", async () => {
    await seedDefaultAvailability(db, userId);
    const slots = await getSlots(db, meetingTypeId, monday.from, monday.to, NOW);
    // 09:00 Lagos = 08:00 UTC; last 30-min slot starts 16:30 Lagos = 15:30 UTC.
    expect(slots[0]?.startAt.toISOString()).toBe("2026-01-05T08:00:00.000Z");
    expect(slots.at(-1)?.startAt.toISOString()).toBe("2026-01-05T15:30:00.000Z");

    await db.insert(schema.bookings).values({
      userId,
      meetingTypeId,
      startAt: new Date("2026-01-05T08:00:00Z"),
      endAt: new Date("2026-01-05T08:30:00Z"),
      inviteeName: "A",
      inviteeEmail: "a@example.com",
      inviteeTimezone: "UTC",
      manageTokenHash: generateManageToken().hash,
      icsUid: `${crypto.randomUUID()}@test`,
    });
    const after = await getSlots(db, meetingTypeId, monday.from, monday.to, NOW);
    expect(after[0]?.startAt.toISOString()).toBe("2026-01-05T08:30:00.000Z");

    await saveDateOverride(db, userId, {
      kind: "unavailable",
      from: "2026-01-05",
      to: "2026-01-05",
    });
    expect(await getSlots(db, meetingTypeId, monday.from, monday.to, NOW)).toEqual([]);
  });

  it("re-checks a start time server-side", async () => {
    await seedDefaultAvailability(db, userId);
    expect(await isStartBookable(db, meetingTypeId, new Date("2026-01-05T08:00:00Z"), NOW)).toBe(
      true,
    );
    expect(await isStartBookable(db, meetingTypeId, new Date("2026-01-05T07:30:00Z"), NOW)).toBe(
      false,
    );
    // Beyond max days ahead (30).
    expect(await isStartBookable(db, meetingTypeId, new Date("2026-03-02T08:00:00Z"), NOW)).toBe(
      false,
    );
  });

  it("returns nothing for a disabled meeting type", async () => {
    await seedDefaultAvailability(db, userId);
    await db
      .update(schema.meetingTypes)
      .set({ isActive: false })
      .where(eq(schema.meetingTypes.id, meetingTypeId));
    expect(await getSlots(db, meetingTypeId, monday.from, monday.to, NOW)).toEqual([]);
    await db
      .update(schema.meetingTypes)
      .set({ isActive: true })
      .where(eq(schema.meetingTypes.id, meetingTypeId));
  });

  it("flags, but keeps, bookings on newly blocked dates (F1.2)", async () => {
    const [booking] = await db
      .insert(schema.bookings)
      .values({
        userId,
        meetingTypeId,
        startAt: new Date("2026-01-07T09:00:00Z"),
        endAt: new Date("2026-01-07T09:30:00Z"),
        inviteeName: "Ada",
        inviteeEmail: "ada@example.com",
        inviteeTimezone: "Africa/Lagos",
        manageTokenHash: generateManageToken().hash,
        icsUid: `${crypto.randomUUID()}@test`,
      })
      .returning();
    await saveDateOverride(db, userId, {
      kind: "unavailable",
      from: "2026-01-07",
      to: "2026-01-07",
    });

    const flagged = await findBookingsOnBlockedDates(db, userId, NOW);
    expect(flagged.map((b) => b.id)).toEqual([booking!.id]);
    const still = await db.query.bookings.findFirst({ where: eq(schema.bookings.id, booking!.id) });
    expect(still?.status).toBe("confirmed");
  });
});
