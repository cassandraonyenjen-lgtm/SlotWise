import { describe, expect, it } from "vitest";
import {
  buildIcs,
  googleCalendarUrl,
  outlookCalendarUrl,
  type CalendarEvent,
} from "./calendar-links";

const event: CalendarEvent = {
  uid: "abc-123@slotwise.app",
  sequence: 0,
  title: "Intro call with Jane",
  description: "Booked with Slotwise",
  location: "https://meet.example.com/jane",
  startAt: new Date("2030-01-07T09:00:00Z"),
  endAt: new Date("2030-01-07T09:30:00Z"),
};

describe("calendar links", () => {
  it("builds an .ics with a stable UID, sequence and UTC times", () => {
    const ics = buildIcs(event);
    expect(ics).toContain("UID:abc-123@slotwise.app");
    expect(ics).toContain("SEQUENCE:0");
    expect(ics).toContain("DTSTART:20300107T090000Z");
    expect(ics).toContain("DTEND:20300107T093000Z");
  });

  it("defaults to a confirmed REQUEST", () => {
    const ics = buildIcs(event);
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("STATUS:CONFIRMED");
  });

  it("cancels the same event with METHOD:CANCEL and a higher sequence (F4.4)", () => {
    const ics = buildIcs({ ...event, sequence: 2 }, { method: "CANCEL" });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("UID:abc-123@slotwise.app");
    expect(ics).toContain("SEQUENCE:2");
  });

  it("lists the invitee as an attendee", () => {
    const ics = buildIcs(event, { attendee: { name: "Ada", email: "ada@example.com" } });
    // Long lines are folded at 75 characters, so check the unfolded text.
    const unfolded = ics.replace(/\r?\n[ \t]/g, "");
    expect(unfolded).toMatch(/ATTENDEE;.*mailto:ada@example\.com/);
  });

  it("builds a Google Calendar link in UTC", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.searchParams.get("dates")).toBe("20300107T090000Z/20300107T093000Z");
    expect(url.searchParams.get("text")).toBe("Intro call with Jane");
  });

  it("builds an Outlook link", () => {
    const url = new URL(outlookCalendarUrl(event));
    expect(url.searchParams.get("startdt")).toBe("2030-01-07T09:00:00.000Z");
  });
});
