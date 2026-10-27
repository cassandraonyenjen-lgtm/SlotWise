/** Meeting types, usernames and the public booking write against a real Postgres. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { seedDefaultAvailability } from "@/features/availability/queries";
import {
  createMeetingType,
  deleteMeetingType,
  getMeetingType,
  setUsername,
  updateMeetingType,
} from "@/features/booking-page/meeting-types";
import { createBooking, getPublicHost, getPublicSlots } from "@/features/booking-page/public";
import { bookingRequestSchema, type MeetingTypeInput } from "@/features/booking-page/schemas";
import { hashManageToken } from "@/lib/tokens";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must point at a migrated test database");

const client = postgres(url, { max: 10, onnotice: () => {} });
const db = drizzle(client, { schema });

const suffix = crypto.randomUUID().slice(0, 8);
const username = `host-${suffix}`;
let userId: string;

// Monday 5 Jan 2026, 06:00 in Lagos.
const NOW = new Date("2026-01-05T05:00:00Z");

const base: MeetingTypeInput = {
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
};

const request = (overrides: Record<string, unknown> = {}) =>
  bookingRequestSchema.parse({
    username,
    slug: "intro",
    startAt: "2026-01-05T08:00:00Z", // 09:00 Lagos
    inviteeName: "Ada",
    inviteeEmail: "ada@example.com",
    inviteeTimezone: "Europe/London",
    notes: "",
    answers: {},
    ...overrides,
  });

beforeAll(async () => {
  const [user] = await db
    .insert(schema.users)
    .values({ email: `${username}@example.com`, name: "Jane Host", timezone: "Africa/Lagos" })
    .returning();
  userId = user!.id;
  await seedDefaultAvailability(db, userId);
  expect(await setUsername(db, userId, username)).toEqual({ ok: true });
});

beforeEach(async () => {
  await db.delete(schema.bookings).where(eq(schema.bookings.userId, userId));
  await db.delete(schema.meetingTypes).where(eq(schema.meetingTypes.userId, userId));
});

afterAll(async () => {
  if (userId) {
    await db.delete(schema.bookings).where(eq(schema.bookings.userId, userId));
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  }
  await client.end();
});

describe("usernames (F2.2)", () => {
  it("rejects a username another host already has", async () => {
    const [other] = await db
      .insert(schema.users)
      .values({ email: `other-${suffix}@example.com` })
      .returning();
    const result = await setUsername(db, other!.id, username);
    expect(result).toEqual({ ok: false, error: "That link is already taken. Try another." });
    await db.delete(schema.users).where(eq(schema.users.id, other!.id));
  });
});

describe("meeting types (F2.1, F2.5)", () => {
  it("creates, edits and keeps question ids so past answers stay linked", async () => {
    const created = await createMeetingType(db, userId, {
      ...base,
      questions: [
        { label: "Company?", type: "short_text", required: true },
        { label: "Goals?", type: "long_text", required: false },
      ],
    });
    expect(created.ok).toBe(true);
    const id = created.ok ? created.id : "";
    const before = await getMeetingType(db, userId, id);
    const [company, goals] = before!.questions;

    // Remove the first question, keep the second (now position 0), add a new one.
    const updated = await updateMeetingType(db, userId, id, {
      ...base,
      name: "Discovery call",
      questions: [
        { id: goals!.id, label: "Goals?", type: "long_text", required: true },
        { label: "Budget?", type: "short_text", required: false },
      ],
    });
    expect(updated.ok).toBe(true);
    const after = await getMeetingType(db, userId, id);
    expect(after!.name).toBe("Discovery call");
    expect(after!.questions.map((q) => [q.label, q.position, q.required])).toEqual([
      ["Goals?", 0, true],
      ["Budget?", 1, false],
    ]);
    expect(after!.questions[0]!.id).toBe(goals!.id);
    expect(after!.questions.some((q) => q.id === company!.id)).toBe(false);
  });

  it("rejects a duplicate link name for the same host", async () => {
    await createMeetingType(db, userId, base);
    const second = await createMeetingType(db, userId, { ...base, name: "Other" });
    expect(second).toMatchObject({ ok: false, field: "slug" });
  });

  it("won't delete a meeting type that has bookings", async () => {
    const created = await createMeetingType(db, userId, base);
    const id = created.ok ? created.id : "";
    expect((await createBooking(db, request(), NOW)).ok).toBe(true);
    expect((await deleteMeetingType(db, userId, id)).ok).toBe(false);
  });

  it("hides inactive meeting types from the public page", async () => {
    await createMeetingType(db, userId, base);
    await createMeetingType(db, userId, { ...base, slug: "hidden", isActive: false });
    const page = await getPublicHost(db, username);
    expect(page!.meetingTypes.map((m) => m.slug)).toEqual(["intro"]);
  });
});

describe("booking (F2.4, F2.6)", () => {
  it("books a slot, stores answers and a hashed manage token, and frees nothing else", async () => {
    await createMeetingType(db, userId, {
      ...base,
      questions: [{ label: "Company?", type: "short_text", required: true }],
    });
    const mt = await db.query.meetingTypes.findFirst({
      where: eq(schema.meetingTypes.userId, userId),
      with: { questions: true },
    });
    const questionId = mt!.questions[0]!.id;

    const missing = await createBooking(db, request(), NOW);
    expect(missing).toMatchObject({ ok: false, reason: "invalid", field: `answers.${questionId}` });

    const result = await createBooking(db, request({ answers: { [questionId]: "Acme" } }), NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.booking.endAt.toISOString()).toBe("2026-01-05T08:30:00.000Z");
    expect(result.booking.manageTokenHash).toBe(hashManageToken(result.manageToken));
    expect(result.booking.manageTokenHash).not.toContain(result.manageToken);

    const answers = await db.query.bookingAnswers.findMany({
      where: eq(schema.bookingAnswers.bookingId, result.booking.id),
    });
    expect(answers.map((a) => a.answer)).toEqual(["Acme"]);
    const events = await db.query.bookingEvents.findMany({
      where: eq(schema.bookingEvents.bookingId, result.booking.id),
    });
    expect(events.map((e) => e.type)).toEqual(["created"]);

    const slots = await getPublicSlots(
      db,
      username,
      "intro",
      new Date("2026-01-05T00:00:00Z"),
      new Date("2026-01-06T00:00:00Z"),
      NOW,
    );
    expect(slots!.map((s) => s.startAt.toISOString())).not.toContain("2026-01-05T08:00:00.000Z");
  });

  it("reports a taken slot when it was booked first", async () => {
    await createMeetingType(db, userId, base);
    expect((await createBooking(db, request(), NOW)).ok).toBe(true);
    expect(await createBooking(db, request({ inviteeEmail: "b@example.com" }), NOW)).toEqual({
      ok: false,
      reason: "taken",
    });
  });

  it("exactly one of 20 simultaneous bookings for a slot succeeds", async () => {
    await createMeetingType(db, userId, base);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        createBooking(db, request({ inviteeEmail: `p${i}@example.com` }), NOW),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "taken")).toHaveLength(19);
  });

  it("rejects starts outside availability or off the slot grid (F1.5)", async () => {
    await createMeetingType(db, userId, base);
    for (const startAt of [
      "2026-01-05T06:00:00Z",
      "2026-01-05T08:10:00Z",
      "2026-01-10T09:00:00Z",
    ]) {
      expect(await createBooking(db, request({ startAt }), NOW)).toEqual({
        ok: false,
        reason: "taken",
      });
    }
  });

  it("returns not_found for unknown or reserved hosts", async () => {
    expect(await createBooking(db, request({ username: "dashboard" }), NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await createBooking(db, request({ slug: "nope" }), NOW)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});
