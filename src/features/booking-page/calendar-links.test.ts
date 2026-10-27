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
