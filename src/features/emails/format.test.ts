import { describe, expect, it } from "vitest";
import { formatMeetingTime, formatShortDate, fromWithName } from "./format";

const start = new Date("2030-01-07T08:00:00Z");
const end = new Date("2030-01-07T08:30:00Z");

describe("formatMeetingTime", () => {
  it("shows the time in the given zone, with the zone named", () => {
    expect(formatMeetingTime(start, end, "Africa/Lagos")).toBe(
      "Monday, January 7, 2030, 9:00 AM – 9:30 AM (Africa/Lagos)",
    );
  });

  it("can land on a different day for a different zone", () => {
    expect(formatMeetingTime(start, end, "America/Los_Angeles")).toContain("Monday, January 7");
    expect(formatMeetingTime(start, end, "Pacific/Kiritimati")).toContain("Monday, January 7");
    expect(formatMeetingTime(start, end, "America/Los_Angeles")).toContain("12:00 AM");
    expect(
      formatMeetingTime(new Date("2030-01-07T02:00:00Z"), end, "America/Los_Angeles"),
    ).toContain("Sunday, January 6");
  });
});

describe("formatShortDate", () => {
  it("is short and zone-aware", () => {
    expect(formatShortDate(start, "Africa/Lagos")).toMatch(/Jan 7/);
  });
});

describe("fromWithName", () => {
  it("keeps the configured address and adds the host's name", () => {
    expect(fromWithName("Slotwise <no-reply@slotwise.app>", "Jane Host")).toBe(
      '"Jane Host via Slotwise" <no-reply@slotwise.app>',
    );
    expect(fromWithName("no-reply@slotwise.app", "Jane")).toBe(
      '"Jane via Slotwise" <no-reply@slotwise.app>',
    );
  });

  it("strips characters that could break the header", () => {
    expect(fromWithName("a@b.co", 'Evil"\r\nBcc: x@y.z <')).toBe(
      '"EvilBcc: x@y.z via Slotwise" <a@b.co>',
    );
    expect(fromWithName("a@b.co", "  ")).toBe('"Slotwise" <a@b.co>');
  });
});
