import { describe, expect, it } from "vitest";
import { dateOverrideSchema, timeZoneSchema, weeklyHoursSchema } from "./schemas";

const emptyWeek = () => Array.from({ length: 7 }, () => [] as { start: string; end: string }[]);

describe("weeklyHoursSchema (F1.1)", () => {
  it("accepts several non-overlapping ranges per day", () => {
    const days = emptyWeek();
    days[1] = [
      { start: "09:00", end: "12:00" },
      { start: "14:00", end: "17:00" },
    ];
    expect(weeklyHoursSchema.safeParse({ days }).success).toBe(true);
  });

  it("accepts ranges that touch", () => {
    const days = emptyWeek();
    days[1] = [
      { start: "09:00", end: "12:00" },
      { start: "12:00", end: "13:00" },
    ];
    expect(weeklyHoursSchema.safeParse({ days }).success).toBe(true);
  });

  it("rejects overlapping ranges with a clear message on the right field", () => {
    const days = emptyWeek();
    days[2] = [
      { start: "13:00", end: "15:00" },
      { start: "09:00", end: "13:30" },
    ];
    const result = weeklyHoursSchema.safeParse({ days });
    expect(result.success).toBe(false);
    const issue = result.error!.issues[0]!;
    expect(issue.message).toBe("Tuesday: 09:00–13:30 overlaps 13:00–15:00");
    expect(issue.path).toEqual(["days", 2, 0, "start"]);
  });

  it("rejects an end before the start", () => {
    const days = emptyWeek();
    days[1] = [{ start: "17:00", end: "09:00" }];
    const result = weeklyHoursSchema.safeParse({ days });
    expect(result.error?.issues[0]?.message).toBe("End time must be after start time");
  });

  it("rejects malformed times", () => {
    const days = emptyWeek();
    days[1] = [{ start: "9am", end: "17:00" }];
    expect(weeklyHoursSchema.safeParse({ days }).success).toBe(false);
  });

  it("allows 24:00 as an end time", () => {
    const days = emptyWeek();
    days[5] = [{ start: "20:00", end: "24:00" }];
    expect(weeklyHoursSchema.safeParse({ days }).success).toBe(true);
  });
});

describe("dateOverrideSchema (F1.2, F1.3)", () => {
  it("accepts blocking a span of dates", () => {
    const r = dateOverrideSchema.safeParse({
      kind: "unavailable",
      from: "2026-12-24",
      to: "2027-01-02",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a span that ends before it starts", () => {
    const r = dateOverrideSchema.safeParse({
      kind: "unavailable",
      from: "2026-12-24",
      to: "2026-12-20",
    });
    expect(r.success).toBe(false);
  });

  it("rejects impossible dates", () => {
    const r = dateOverrideSchema.safeParse({
      kind: "unavailable",
      from: "2026-02-30",
      to: "2026-02-30",
    });
    expect(r.success).toBe(false);
  });

  it("rejects overlapping custom hours", () => {
    const r = dateOverrideSchema.safeParse({
      kind: "hours",
      date: "2026-12-24",
      ranges: [
        { start: "09:00", end: "11:00" },
        { start: "10:00", end: "12:00" },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("requires at least one range for custom hours", () => {
    const r = dateOverrideSchema.safeParse({ kind: "hours", date: "2026-12-24", ranges: [] });
    expect(r.success).toBe(false);
  });
});

describe("timeZoneSchema", () => {
  it.each(["Africa/Lagos", "America/New_York", "Europe/London", "Australia/Sydney", "UTC"])(
    "accepts %s",
    (tz) => expect(timeZoneSchema.safeParse(tz).success).toBe(true),
  );

  it("rejects made-up zones", () => {
    expect(timeZoneSchema.safeParse("Mars/Olympus_Mons").success).toBe(false);
  });
});
