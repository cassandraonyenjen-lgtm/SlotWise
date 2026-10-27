/** Reschedule, cancel, cutoff and no-show against a real Postgres (F5, F3.5). */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { seedDefaultAvailability } from "@/features/availability/queries";
import {
  cancelBooking,
  findBookingByManageToken,
  getRescheduleSlots,
  markNoShow,
  rescheduleBooking,
} from "@/features/booking-management/manage";
import { createMeetingType, setUsername } from "@/features/booking-page/meeting-types";
import { createBooking, getPublicSlots } from "@/features/booking-page/public";
import { bookingRequestSchema } from "@/features/booking-page/schemas";
import { getCalendarData, getTodaySummary } from "@/features/calendar/queries";
import { sendBookingNotifications } from "@/features/emails/send";
import { MemoryTransport } from "@/features/emails/transport";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must point at a migrated test database");

const client = postgres(url, { max: 5, onnotice: () => {} });
const db = drizzle(client, { schema });

const suffix = crypto.randomUUID().slice(0, 8);
const username = `mgmt-${suffix}`;
let userId: string;
let otherUserId: string;
// Monday 5 Jan 2026, 06:00 in Lagos. Hours are 09:00–17:00 Lagos (08:00–16:00 UTC).
const NOW = new Date("2026-01-05T05:00:00Z");
const NINE = new Date("2026-01-05T08:00:00Z");
const TEN = new Date("2026-01-05T09:00:00Z");
const ELEVEN = new Date("2026-01-05T10:00:00Z");

async function book(startAt: Date, email = "ada@example.com") {
  const result = await createBooking(
    db,
    bookingRequestSchema.parse({
      username,
      slug: "intro",
      startAt: startAt.toISOString(),
      inviteeName: "Ada",
      inviteeEmail: email,
      inviteeTimezone: "Europe/London",
      notes: "",
      answers: {},
    }),
    NOW,
  );
  if (!result.ok) throw new Error(`booking failed: ${result.reason}`);
  return result;
}

const invitee = { kind: "invitee" } as const;
const host = () => ({ kind: "host", userId }) as const;

beforeAll(async () => {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `${username}@example.com`, name: "Jane Host", timezone: "Africa/Lagos" })
    .returning();
  userId = user!.id;
  const [other] = await db
    .insert(schema.users)
    .values({ email: `other-${suffix}@example.com`, timezone: "Africa/Lagos" })
    .returning();
  otherUserId = other!.id;
  await seedDefaultAvailability(db, userId);
  expect(await setUsername(db, userId, username)).toEqual({ ok: true });
  const created = await createMeetingType(db, userId, {
    name: "Intro call",
    slug: "intro",
    durationMin: 30,
    description: null,
    locationType: "video_link",
    locationValue: "https://meet.example.com/x",
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minNoticeMin: 0,
    maxDaysAhead: 30,
    dailyLimit: null,
    isActive: true,
    questions: [],
  });
  expect(created.ok).toBe(true);
});

beforeEach(async () => {
  await db.delete(schema.bookings).where(eq(schema.bookings.userId, userId));
  await db.update(schema.users).set({ cancelCutoffMin: 0 }).where(eq(schema.users.id, userId));
});

afterAll(async () => {
  await db.delete(schema.bookings).where(eq(schema.bookings.userId, userId));
  await db.delete(schema.users).where(eq(schema.users.id, userId));
  await db.delete(schema.users).where(eq(schema.users.id, otherUserId));
  await client.end();
});

const eventsFor = (bookingId: string) =>
  db.select().from(schema.bookingEvents).where(eq(schema.bookingEvents.bookingId, bookingId));

describe("manage links (F5.5)", () => {
  it("find the booking by token, and nothing for a wrong or malformed one", async () => {
    const { booking, manageToken } = await book(NINE);
    const found = await findBookingByManageToken(db, manageToken, NOW);
    expect(found?.booking.id).toBe(booking.id);
    expect(found?.state).toBe("active");
    expect(await findBookingByManageToken(db, `${manageToken.slice(0, -2)}xx`, NOW)).toBeNull();
    expect(await findBookingByManageToken(db, "short", NOW)).toBeNull();
    expect(await findBookingByManageToken(db, "../../etc/passwd/aaaaaaaaaaaaaaaa", NOW)).toBeNull();
  });

  it("stop allowing changes once the meeting starts, and inside the cutoff (F5.4)", async () => {
    const { manageToken } = await book(NINE);
    expect((await findBookingByManageToken(db, manageToken, NINE))?.state).toBe("past");
    await db.update(schema.users).set({ cancelCutoffMin: 240 }).where(eq(schema.users.id, userId));
    expect((await findBookingByManageToken(db, manageToken, NOW))?.state).toBe("within_cutoff");
  });
});

describe("rescheduling (F5.1, F5.3)", () => {
  it("moves the booking in place, bumps the sequence, logs it and frees the old time", async () => {
    const { booking } = await book(NINE);
    const result = await rescheduleBooking(db, {
      bookingId: booking.id,
      actor: invitee,
      startAt: ELEVEN,
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, sequence: 1, previousStartAt: NINE });

    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, booking.id));
    expect(row!.startAt).toEqual(ELEVEN);
    expect(row!.endAt).toEqual(new Date(ELEVEN.getTime() + 30 * 60_000));
    expect(row!.icsUid).toBe(booking.icsUid);
    expect(row!.icsSequence).toBe(1);
    const events = await eventsFor(booking.id);
    expect(events.map((e) => e.type).sort()).toEqual(["created", "rescheduled"]);

    const slots = await getPublicSlots(
      db,
      username,
      "intro",
      NOW,
      new Date("2026-01-05T16:00:00Z"),
      NOW,
    );
    const starts = slots!.map((s) => s.startAt.toISOString());
    expect(starts).toContain(NINE.toISOString());
    expect(starts).not.toContain(ELEVEN.toISOString());
  });

  it("offers times around the booking's own slot, but not taken ones", async () => {
    const { booking } = await book(NINE);
    await book(TEN, "grace@example.com");
    const slots = await getRescheduleSlots(db, {
      bookingId: booking.id,
      actor: invitee,
      from: NOW,
      to: new Date("2026-01-05T16:00:00Z"),
      now: NOW,
    });
    const starts = slots!.map((s) => s.toISOString());
    expect(starts).toContain(new Date("2026-01-05T08:30:00Z").toISOString());
    expect(starts).not.toContain(NINE.toISOString());
    expect(starts).not.toContain(TEN.toISOString());
  });

  it("refuses a taken time and a time outside availability", async () => {
    const { booking } = await book(NINE);
    await book(TEN, "grace@example.com");
    const taken = await rescheduleBooking(db, {
      bookingId: booking.id,
      actor: invitee,
      startAt: TEN,
      now: NOW,
    });
    expect(taken).toMatchObject({ ok: false, reason: "taken" });
    const night = await rescheduleBooking(db, {
      bookingId: booking.id,
      actor: invitee,
      startAt: new Date("2026-01-05T22:00:00Z"),
      now: NOW,
    });
    expect(night).toMatchObject({ ok: false, reason: "taken" });
  });

  it("holds invitees to the cutoff but lets the host move it", async () => {
    const { booking } = await book(NINE);
    await db.update(schema.users).set({ cancelCutoffMin: 240 }).where(eq(schema.users.id, userId));
    const blocked = await rescheduleBooking(db, {
      bookingId: booking.id,
      actor: invitee,
      startAt: ELEVEN,
      now: NOW,
    });
    expect(blocked).toMatchObject({ ok: false, reason: "not_allowed" });
    const moved = await rescheduleBooking(db, {
      bookingId: booking.id,
      actor: host(),
      startAt: ELEVEN,
      message: "Running late, sorry",
      now: NOW,
    });
    expect(moved.ok).toBe(true);
    const [event] = await db
      .select()
      .from(schema.bookingEvents)
      .where(
        and(
          eq(schema.bookingEvents.bookingId, booking.id),
          eq(schema.bookingEvents.type, "rescheduled"),
        ),
      );
    expect(event!.actor).toBe("host");
    expect(event!.data).toMatchObject({ message: "Running late, sorry" });
  });

  it("emails both people the new time with an updated invite", async () => {
    const { booking } = await book(NINE);
    await rescheduleBooking(db, {
      bookingId: booking.id,
      actor: invitee,
      startAt: ELEVEN,
      now: NOW,
    });
    const transport = new MemoryTransport();
    await sendBookingNotifications(db, transport, "rescheduled", booking.id, {
      appUrl: "https://slotwise.test",
      previousStartAt: NINE,
      previousEndAt: new Date(NINE.getTime() + 30 * 60_000),
    });
    expect(transport.sent).toHaveLength(2);
    const ics = transport.sent[0]!.attachments![0]!.content;
    expect(ics).toContain(`UID:${booking.icsUid}`);
    expect(ics).toContain("SEQUENCE:1");
    expect(transport.sent[0]!.subject).toMatch(/^Rescheduled:/);
  });
});

describe("cancelling (F5.2, F5.3)", () => {
  it("cancels once, records who and why, and frees the slot", async () => {
    const { booking } = await book(NINE);
    const result = await cancelBooking(db, {
      bookingId: booking.id,
      actor: invitee,
      reason: "  Something came up  ",
      now: NOW,
    });
    expect(result).toMatchObject({ ok: true, sequence: 1 });
    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, booking.id));
    expect(row).toMatchObject({
      status: "cancelled",
      cancelReason: "Something came up",
      cancelledBy: "invitee",
      icsSequence: 1,
    });
    expect(
      await cancelBooking(db, { bookingId: booking.id, actor: invitee, now: NOW }),
    ).toMatchObject({ ok: false, reason: "not_allowed" });
    // The time can be booked again.
    await expect(book(NINE, "grace@example.com")).resolves.toMatchObject({ ok: true });

    const transport = new MemoryTransport();
    await sendBookingNotifications(db, transport, "cancelled", booking.id, {
      appUrl: "https://slotwise.test",
    });
    expect(transport.sent.map((e) => e.subject)).toEqual([
      expect.stringMatching(/^Cancelled:/),
      expect.stringMatching(/^Cancelled:/),
    ]);
    expect(transport.sent[0]!.attachments![0]!.content).toContain("METHOD:CANCEL");
    expect(transport.sent[1]!.text).toContain("Something came up");
  });

  it("only lets a host touch their own bookings", async () => {
    const { booking } = await book(NINE);
    const result = await cancelBooking(db, {
      bookingId: booking.id,
      actor: { kind: "host", userId: otherUserId },
      now: NOW,
    });
    expect(result).toMatchObject({ ok: false, reason: "not_found" });
    expect(
      await markNoShow(db, { bookingId: booking.id, userId: otherUserId, now: ELEVEN }),
    ).toMatchObject({ ok: false });
  });
});

describe("no-shows (F3.5)", () => {
  it("can only be marked once the meeting has started", async () => {
    const { booking } = await book(NINE);
    expect(await markNoShow(db, { bookingId: booking.id, userId, now: NOW })).toMatchObject({
      ok: false,
    });
    expect(await markNoShow(db, { bookingId: booking.id, userId, now: TEN })).toEqual({ ok: true });
    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, booking.id));
    expect(row!.status).toBe("no_show");
    expect((await eventsFor(booking.id)).map((e) => e.type)).toContain("marked_no_show");
  });
});

describe("dashboard reads (F3)", () => {
  it("shows bookings and blocked days in the host's zone, without cancelled ones", async () => {
    const { booking } = await book(NINE);
    const { booking: gone } = await book(TEN, "grace@example.com");
    await cancelBooking(db, { bookingId: gone.id, actor: invitee, now: NOW });
    await db
      .insert(schema.dateOverrides)
      .values({ userId, date: "2026-01-06", isUnavailable: true });

    const data = await getCalendarData(
      db,
      userId,
      new Date("2026-01-04T23:00:00Z"),
      new Date("2026-01-11T23:00:00Z"),
    );
    expect(data.timezone).toBe("Africa/Lagos");
    expect(data.bookings).toEqual([
      {
        id: booking.id,
        title: "Ada · Intro call",
        start: "2026-01-05T09:00:00",
        end: "2026-01-05T09:30:00",
        status: "confirmed",
      },
    ]);
    expect(data.blocks).toEqual([{ date: "2026-01-06", hours: null }]);
    await db.delete(schema.dateOverrides).where(eq(schema.dateOverrides.userId, userId));
  });

  it("splits today's meetings from what's coming up", async () => {
    await book(NINE);
    await book(new Date("2026-01-06T08:00:00Z"), "grace@example.com");
    const summary = await getTodaySummary(db, userId, NOW);
    expect(summary.today).toHaveLength(1);
    expect(summary.next).toHaveLength(1);
  });
});
