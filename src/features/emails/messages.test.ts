import { describe, expect, it } from "vitest";
import type { BookingContext } from "./context";
import { buildMessage } from "./messages";

const ctx: BookingContext = {
  booking: {
    id: "8f0c1a52-6b1e-4f43-9d2e-0a8e6f6f2b11",
    userId: "u1",
    meetingTypeId: "m1",
    startAt: new Date("2030-01-07T08:00:00Z"),
    endAt: new Date("2030-01-07T08:30:00Z"),
    inviteeName: "Ada Lovelace",
    inviteeEmail: "ada@example.com",
    inviteeTimezone: "America/New_York",
    notes: "Looking forward to it",
    status: "confirmed",
    manageTokenHash: "x",
    icsUid: "uid-1@slotwise",
    icsSequence: 0,
    cancelReason: null,
    cancelledBy: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as BookingContext["booking"],
  host: {
    username: "jane",
    name: "Jane Host",
    email: "jane@example.com",
    timezone: "Africa/Lagos",
    logoUrl: null,
    reminderPolicy: "24h",
  },
  meetingType: {
    name: "Intro call",
    locationType: "video_link",
    locationValue: "https://meet.example.com/x",
  },
  answers: [{ label: "Company", answer: "Analytical Engines" }],
};

const opts = { appUrl: "https://slotwise.test" };

describe("buildMessage", () => {
  it("confirms to the invitee in the invitee's zone, with a calendar invite", async () => {
    const m = await buildMessage("invitee_confirmation", "invitee", ctx, opts);
    expect(m.to).toBe("ada@example.com");
    expect(m.replyTo).toBe("jane@example.com");
    expect(m.subject).toBe("Confirmed: Intro call with Jane Host on Jan 7");
    expect(m.text).toContain("3:00 AM – 3:30 AM (America/New York)");
    expect(m.html).toContain("https://slotwise.test/manage/");
    expect(m.ics?.method).toBe("REQUEST");
    expect(m.ics?.content).toContain("UID:uid-1@slotwise");
  });

  it("notifies the host in the host's zone, with the invitee's answers", async () => {
    const m = await buildMessage("host_notification", "host", ctx, opts);
    expect(m.to).toBe("jane@example.com");
    expect(m.replyTo).toBe("ada@example.com");
    expect(m.subject).toBe("New booking: Ada Lovelace, Intro call on Jan 7");
    expect(m.text).toContain("9:00 AM – 9:30 AM (Africa/Lagos)");
    expect(m.text).toContain("Analytical Engines");
    expect(m.text).toContain("Looking forward to it");
    expect(m.html).not.toContain("/manage/");
  });

  it("words reminders by offset and attaches no invite", async () => {
    const day = await buildMessage("reminder", "invitee", ctx, { ...opts, reminderOffset: "24h" });
    const hour = await buildMessage("reminder", "invitee", ctx, { ...opts, reminderOffset: "1h" });
    expect(day.subject).toBe("Reminder: Intro call with Jane Host tomorrow");
    expect(hour.subject).toBe("Reminder: Intro call with Jane Host in 1 hour");
    expect(day.ics).toBeUndefined();
  });

  it("sends a CANCEL invite with the same UID on cancellation", async () => {
    const cancelled = {
      ...ctx,
      booking: {
        ...ctx.booking,
        status: "cancelled" as const,
        cancelReason: "Sick",
        icsSequence: 1,
      },
    };
    const m = await buildMessage("cancellation", "invitee", cancelled, opts);
    expect(m.subject).toBe("Cancelled: Intro call with Jane Host on Jan 7");
    expect(m.text).toContain("Sick");
    expect(m.html).toContain("https://slotwise.test/jane");
    expect(m.ics?.method).toBe("CANCEL");
    expect(m.ics?.content).toContain("METHOD:CANCEL");
    expect(m.ics?.content).toContain("UID:uid-1@slotwise");
    expect(m.ics?.content).toContain("SEQUENCE:1");
  });

  it("shows old and new times on a reschedule", async () => {
    const m = await buildMessage("reschedule", "host", ctx, {
      ...opts,
      previousStartAt: new Date("2030-01-06T10:00:00Z"),
      previousEndAt: new Date("2030-01-06T10:30:00Z"),
    });
    expect(m.subject).toBe("Rescheduled: Intro call with Ada Lovelace, now Jan 7");
    expect(m.text).toContain("11:00 AM – 11:30 AM (Africa/Lagos)");
    expect(m.ics?.method).toBe("REQUEST");
  });

  it("escapes what invitees typed", async () => {
    const hostile = { ...ctx, booking: { ...ctx.booking, inviteeName: "<script>x</script>" } };
    const m = await buildMessage("host_notification", "host", hostile, opts);
    expect(m.html).not.toContain("<script>x</script>");
  });
});
