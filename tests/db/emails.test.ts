/** Email sending against a real Postgres: exactly-once delivery, retries, stale reminders. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { seedDefaultAvailability } from "@/features/availability/queries";
import { createMeetingType, setUsername } from "@/features/booking-page/meeting-types";
import { createBooking } from "@/features/booking-page/public";
import { bookingRequestSchema } from "@/features/booking-page/schemas";
import { sendBookingNotifications, sendReminder } from "@/features/emails/send";
import { MemoryTransport } from "@/features/emails/transport";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must point at a migrated test database");

const client = postgres(url, { max: 5, onnotice: () => {} });
const db = drizzle(client, { schema });

const suffix = crypto.randomUUID().slice(0, 8);
const username = `mail-${suffix}`;
let userId: string;
let bookingId: string;
const appUrl = "https://slotwise.test";
// Monday 5 Jan 2026, 06:00 in Lagos; the booking is at 09:00 Lagos the same day.
const NOW = new Date("2026-01-05T05:00:00Z");

beforeAll(async () => {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `${username}@example.com`, name: "Jane Host", timezone: "Africa/Lagos" })
    .returning();
  userId = user!.id;
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
  const result = await createBooking(
    db,
    bookingRequestSchema.parse({
      username,
      slug: "intro",
      startAt: "2026-01-05T08:00:00Z",
      inviteeName: "Ada",
      inviteeEmail: "ada@example.com",
      inviteeTimezone: "Europe/London",
      notes: "",
      answers: {},
    }),
    NOW,
  );
  if (!result.ok) throw new Error(`booking failed: ${result.reason}`);
  bookingId = result.booking.id;
});

afterAll(async () => {
  if (userId) {
    await db.delete(schema.bookings).where(eq(schema.bookings.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  }
  await client.end();
});

const logFor = () =>
  db.select().from(schema.emailLog).where(eq(schema.emailLog.bookingId, bookingId));

describe("booking notifications", () => {
  it("emails the invitee and the host, and logs both as sent", async () => {
    const transport = new MemoryTransport();
    await sendBookingNotifications(db, transport, "created", bookingId, { appUrl });

    expect(transport.sent.map((e) => e.to).sort()).toEqual([
      "ada@example.com",
      `${username}@example.com`,
    ]);
    const invitee = transport.sent.find((e) => e.to === "ada@example.com")!;
    expect(invitee.from).toBe('"Jane Host via Slotwise" <no-reply@example.com>');
    expect(invitee.attachments?.[0]?.contentType).toContain("method=REQUEST");
    expect(invitee.text).toContain("(Europe/London)");

    const log = await logFor();
    expect(log).toHaveLength(2);
    expect(log.every((row) => row.status === "sent" && row.sentAt && row.providerId)).toBe(true);
  });

  it("never sends the same email twice, even when the job runs again", async () => {
    const transport = new MemoryTransport();
    await sendBookingNotifications(db, transport, "created", bookingId, { appUrl });
    const again = await sendBookingNotifications(db, transport, "created", bookingId, { appUrl });
    expect(again).toEqual(["skipped", "skipped"]);
    expect(transport.sent).toHaveLength(2);
    expect(await logFor()).toHaveLength(2);
  });

  it("marks a failed send and lets a retry deliver it", async () => {
    const transport = new MemoryTransport();
    transport.failNext = 1;
    await expect(
      sendBookingNotifications(db, transport, "created", bookingId, { appUrl }),
    ).rejects.toThrow("Simulated provider failure");
    expect((await logFor()).map((r) => r.status)).toEqual(["failed"]);

    await sendBookingNotifications(db, transport, "created", bookingId, { appUrl });
    expect(transport.sent).toHaveLength(2);
    expect((await logFor()).map((r) => r.status)).toEqual(["sent", "sent"]);
  });
});

describe("reminders", () => {
  const before = new Date("2026-01-05T06:30:00Z");

  it("sends once per offset", async () => {
    const transport = new MemoryTransport();
    const input = { bookingId, sequence: 0, offset: "1h" as const, appUrl, now: before };
    expect(await sendReminder(db, transport, input)).toBe("sent");
    expect(await sendReminder(db, transport, input)).toBe("skipped");
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.subject).toBe("Reminder: Intro call with Jane Host in 1 hour");
    expect(transport.sent[0]!.to).toBe("ada@example.com");
  });

  it("skips a reminder after the booking was rescheduled or cancelled", async () => {
    const transport = new MemoryTransport();
    await db
      .update(schema.bookings)
      .set({ icsSequence: 1 })
      .where(eq(schema.bookings.id, bookingId));
    expect(
      await sendReminder(db, transport, { bookingId, sequence: 0, offset: "1h", now: before }),
    ).toBe("stale");

    await db
      .update(schema.bookings)
      .set({ status: "cancelled" })
      .where(eq(schema.bookings.id, bookingId));
    expect(
      await sendReminder(db, transport, { bookingId, sequence: 1, offset: "1h", now: before }),
    ).toBe("stale");
    expect(transport.sent).toHaveLength(0);
  });

  it("skips a reminder once the meeting has started", async () => {
    const transport = new MemoryTransport();
    const late = new Date("2026-01-05T08:05:00Z");
    expect(
      await sendReminder(db, transport, { bookingId, sequence: 0, offset: "1h", now: late }),
    ).toBe("stale");
  });
});
