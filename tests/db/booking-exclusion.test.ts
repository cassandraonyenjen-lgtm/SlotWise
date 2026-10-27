/**
 * Proves the database-level double-booking guarantee (PRD F2.6, §7 decision 2, §9 v1 DoD
 * "50 simultaneous requests for one slot produce exactly 1 booking").
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { isSlotTakenError } from "@/features/booking-page/errors";
import { generateManageToken } from "@/lib/tokens";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must point at a migrated test database");

const client = postgres(url, { max: 20, onnotice: () => {} });
const db = drizzle(client, { schema });

let userId: string;
let meetingTypeId: string;

const at = (iso: string) => new Date(iso);

function bookingRow(startIso: string, endIso: string) {
  return {
    userId,
    meetingTypeId,
    startAt: at(startIso),
    endAt: at(endIso),
    inviteeName: "Test Invitee",
    inviteeEmail: "invitee@example.com",
    inviteeTimezone: "Africa/Lagos",
    manageTokenHash: generateManageToken().hash,
    icsUid: `${crypto.randomUUID()}@slotwise.test`,
  };
}

beforeAll(async () => {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `host-${crypto.randomUUID()}@example.com`, timezone: "Europe/London" })
    .returning();
  userId = user!.id;
  const [mt] = await db
    .insert(schema.meetingTypes)
    .values({
      userId,
      slug: "intro",
      name: "Intro call",
      durationMin: 30,
      locationType: "video_link",
    })
    .returning();
  meetingTypeId = mt!.id;
});

beforeEach(async () => {
  await db.delete(schema.bookings).where(eq(schema.bookings.userId, userId));
});

afterAll(async () => {
  if (userId) {
    await db.delete(schema.bookings).where(eq(schema.bookings.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  }
  await client.end();
});

describe("bookings_no_overlap", () => {
  it("rejects an overlapping booking for the same host", async () => {
    await db.insert(schema.bookings).values(bookingRow("2030-01-07T10:00Z", "2030-01-07T10:30Z"));
    const err = await db
      .insert(schema.bookings)
      .values(bookingRow("2030-01-07T10:15Z", "2030-01-07T10:45Z"))
      .catch((e: unknown) => e);
    expect(isSlotTakenError(err)).toBe(true);
  });

  it("allows back-to-back bookings (half-open ranges)", async () => {
    await db.insert(schema.bookings).values(bookingRow("2030-01-07T10:00Z", "2030-01-07T10:30Z"));
    await expect(
      db.insert(schema.bookings).values(bookingRow("2030-01-07T10:30Z", "2030-01-07T11:00Z")),
    ).resolves.toBeDefined();
  });

  it("frees the slot once a booking is cancelled", async () => {
    const [first] = await db
      .insert(schema.bookings)
      .values(bookingRow("2030-01-07T10:00Z", "2030-01-07T10:30Z"))
      .returning();
    await db
      .update(schema.bookings)
      .set({ status: "cancelled" })
      .where(eq(schema.bookings.id, first!.id));
    await expect(
      db.insert(schema.bookings).values(bookingRow("2030-01-07T10:00Z", "2030-01-07T10:30Z")),
    ).resolves.toBeDefined();
  });

  it("50 concurrent requests for one slot produce exactly 1 booking", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () =>
        db.insert(schema.bookings).values(bookingRow("2030-01-08T09:00Z", "2030-01-08T09:30Z")),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(rejected).toHaveLength(49);
    // Raw racing inserts can also lose by deadlock inside the exclusion check (SQLSTATE
    // 40P01). That is still a rejection; createBooking avoids it with a per-host lock.
    expect(rejected.every((r) => isSlotTakenError(r.reason) || isDeadlock(r.reason))).toBe(true);
  }, 60_000);
});

function isDeadlock(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: string }).code === "40P01") return true;
  }
  return false;
}
