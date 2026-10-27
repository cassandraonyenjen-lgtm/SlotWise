import { describe, expect, it } from "vitest";
import { bookingRequestSchema, meetingTypeSchema, slugify } from "./schemas";

const valid = {
  name: "Intro call",
  slug: "intro-call",
  durationMin: 30,
  description: "",
  locationType: "video_link",
  locationValue: "https://meet.example.com/jane",
  bufferBeforeMin: 0,
  bufferAfterMin: 10,
  minNoticeMin: 240,
  maxDaysAhead: 60,
  dailyLimit: null,
  isActive: true,
  questions: [],
};

describe("meetingTypeSchema (F2.1)", () => {
  it("accepts a typical meeting type and normalises an empty description", () => {
    const parsed = meetingTypeSchema.parse(valid);
    expect(parsed.description).toBeNull();
  });

  it.each([14, 241])("rejects a %i-minute duration", (durationMin) => {
    expect(meetingTypeSchema.safeParse({ ...valid, durationMin }).success).toBe(false);
  });

  it("rejects buffers outside 0/5/10/15/30 (F1.4)", () => {
    expect(meetingTypeSchema.safeParse({ ...valid, bufferAfterMin: 7 }).success).toBe(false);
  });

  it("requires a full URL for video links", () => {
    const r = meetingTypeSchema.safeParse({ ...valid, locationValue: "meet.example.com" });
    expect(r.error?.issues[0]?.path).toEqual(["locationValue"]);
  });

  it("accepts any text for phone and in-person locations", () => {
    for (const locationType of ["phone", "in_person"]) {
      const r = meetingTypeSchema.safeParse({
        ...valid,
        locationType,
        locationValue: "+234 800 000",
      });
      expect(r.success).toBe(true);
    }
  });

  it("allows at most 3 questions (F2.5)", () => {
    const q = { label: "Company?", type: "short_text", required: false };
    expect(meetingTypeSchema.safeParse({ ...valid, questions: [q, q, q] }).success).toBe(true);
    expect(meetingTypeSchema.safeParse({ ...valid, questions: [q, q, q, q] }).success).toBe(false);
  });
});

describe("slugify", () => {
  it.each([
    ["Intro Call", "intro-call"],
    ["  30-min  Strategy Session! ", "30-min-strategy-session"],
    ["Café rendez-vous", "cafe-rendez-vous"],
  ])("%s → %s", (name, slug) => expect(slugify(name)).toBe(slug));
});

describe("bookingRequestSchema (F2.4)", () => {
  const request = {
    username: "jane",
    slug: "intro-call",
    startAt: "2030-01-07T09:00:00.000Z",
    inviteeName: "Ada",
    inviteeEmail: " Ada@Example.com ",
    inviteeTimezone: "Africa/Lagos",
    notes: "",
    answers: {},
  };

  it("only needs a name and email", () => {
    const parsed = bookingRequestSchema.parse(request);
    expect(parsed.inviteeEmail).toBe("ada@example.com");
    expect(parsed.startAt.toISOString()).toBe("2030-01-07T09:00:00.000Z");
    expect(parsed.notes).toBeNull();
  });

  it("rejects a bad email and a made-up time zone", () => {
    expect(bookingRequestSchema.safeParse({ ...request, inviteeEmail: "ada" }).success).toBe(false);
    expect(
      bookingRequestSchema.safeParse({ ...request, inviteeTimezone: "Nope/Nope" }).success,
    ).toBe(false);
  });
});
