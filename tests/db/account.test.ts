/** Data export, account deletion and email webhooks against a real Postgres (PRD §8). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { deleteAccount, exportAccount } from "@/features/account/account";
import { seedDefaultAvailability } from "@/features/availability/queries";
import { createMeetingType, setUsername } from "@/features/booking-page/meeting-types";
import { createBooking } from "@/features/booking-page/public";
import { bookingRequestSchema } from "@/features/booking-page/schemas";
import { sendBookingNotifications } from "@/features/emails/send";
import { MemoryTransport } from "@/features/emails/transport";
import { applyResendEvent } from "@/features/emails/webhooks";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must point at a migrated test database");

const client = postgres(url, { max: 5, onnotice: () => {} });
const db = drizzle(client, { schema });
const NOW = new Date("2026-01-05T05:00:00Z");

async function newHost() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const username = `acct-${suffix}`;
  const [user] = await db
    .insert(schema.users)
    .values({ email: `${username}@example.com`, name: "Jane Host", timezone: "Africa/Lagos" })
    .returning();
  await seedDefaultAvailability(db, user!.id);
  await setUsername(db, user!.id, username);
  await createMeetingType(db, user!.id, {
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
    questions: [{ label: "Company", type: "short_text", required: false }],
  });
  return { userId: user!.id, username };
}

async function book(username: string, startAt: string) {
  const result = await createBooking(
    db,
    bookingRequestSchema.parse({
      username,
      slug: "intro",
      startAt,
      inviteeName: "Ada",
      inviteeEmail: "ada@example.com",
      inviteeTimezone: "Europe/London",
      notes: "",
      answers: {},
    }),
    NOW,
  );
  if (!result.ok) throw new Error(result.reason);
  return result.booking;
}

const created: string[] = [];
let host: Awaited<ReturnType<typeof newHost>>;

beforeAll(async () => {
  host = await newHost();
  created.push(host.userId);
});

afterAll(async () => {
  for (const id of created) {
    await db.delete(schema.bookings).where(eq(schema.bookings.userId, id));
    await db.delete(schema.users).where(eq(schema.users.id, id));
  }
  await client.end();
});

describe("data export", () => {
  it("includes the host's profile, setup and bookings, but no secrets", async () => {
    const booking = await book(host.username, "2026-01-05T08:00:00Z");
    const data = await exportAccount(db, host.userId);
    expect(data?.account).toMatchObject({ username: host.username, timezone: "Africa/Lagos" });
    expect(data?.meetingTypes).toHaveLength(1);
    expect(data?.meetingTypes[0]?.questions).toHaveLength(1);
    expect(data?.availability.weekly).toHaveLength(5);
    expect(data?.bookings.map((b) => b.id)).toContain(booking.id);
    expect(data?.bookings[0]?.history.map((e) => e.type)).toEqual(["created"]);
    const json = JSON.stringify(data);
    expect(json).not.toContain(booking.manageTokenHash);
    expect(json).not.toContain("session");
  });
});

describe("account deletion", () => {
  it("cancels upcoming meetings with an email, then deletes everything", async () => {
    const other = await newHost();
    const past = await book(other.username, "2026-01-05T08:00:00Z");
    const future = await book(other.username, "2026-01-06T08:00:00Z");

    const transport = new MemoryTransport();
    const { cancelled } = await deleteAccount(
      db,
      transport,
      other.userId,
      new Date("2026-01-05T12:00:00Z"),
    );
    expect(cancelled).toBe(1);
    expect(transport.sent.map((e) => e.to)).toContain("ada@example.com");
    expect(transport.sent.every((e) => e.subject.startsWith("Cancelled:"))).toBe(true);

    for (const table of [schema.users] as const) {
      expect(await db.select().from(table).where(eq(table.id, other.userId))).toHaveLength(0);
    }
    for (const id of [past.id, future.id]) {
      expect(
        await db.select().from(schema.bookings).where(eq(schema.bookings.id, id)),
      ).toHaveLength(0);
    }
    expect(
      await db
        .select()
        .from(schema.meetingTypes)
        .where(eq(schema.meetingTypes.userId, other.userId)),
    ).toHaveLength(0);
  });
});

describe("Resend webhooks", () => {
  it("records delivery, and a bounce is never overwritten by a late delivery", async () => {
    const booking = await book(host.username, "2026-01-07T08:00:00Z");
    const transport = new MemoryTransport();
    await sendBookingNotifications(db, transport, "created", booking.id, {
      appUrl: "https://slotwise.test",
    });
    const rows = await db
      .select()
      .from(schema.emailLog)
      .where(eq(schema.emailLog.bookingId, booking.id));
    const [first, second] = rows;

    expect(
      await applyResendEvent(db, {
        type: "email.delivered",
        data: { email_id: first!.providerId! },
      }),
    ).toBe(true);
    expect(
      await applyResendEvent(db, {
        type: "email.bounced",
        data: { email_id: second!.providerId! },
      }),
    ).toBe(true);
    expect(
      await applyResendEvent(db, {
        type: "email.delivered",
        data: { email_id: second!.providerId! },
      }),
    ).toBe(false);
    expect(
      await applyResendEvent(db, { type: "email.opened", data: { email_id: first!.providerId! } }),
    ).toBe(false);

    const after = await db
      .select({ id: schema.emailLog.id, status: schema.emailLog.status })
      .from(schema.emailLog)
      .where(eq(schema.emailLog.bookingId, booking.id));
    expect(after.find((r) => r.id === first!.id)?.status).toBe("delivered");
    expect(after.find((r) => r.id === second!.id)?.status).toBe("bounced");
  });
});
