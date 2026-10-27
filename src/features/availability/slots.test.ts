import { describe, expect, it } from "vitest";
import { computeSlots, isSlotAvailable } from "./slots";
import type { BookingRules, SlotQuery, WeeklyRange } from "./types";

const rules: BookingRules = {
  durationMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
  minNoticeMin: 0,
  maxDaysAhead: 365,
  dailyLimit: null,
};

const weekdays = (start: string, end: string): WeeklyRange[] =>
  [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start, end }));

function query(overrides: Partial<SlotQuery> = {}): SlotQuery {
  return {
    hostTimezone: "UTC",
    weekly: weekdays("09:00", "17:00"),
    overrides: [],
    rules,
    busy: [],
    from: new Date("2026-01-01T00:00:00Z"),
    to: new Date("2026-01-02T00:00:00Z"),
    now: new Date("2025-12-01T00:00:00Z"),
    ...overrides,
  };
}

/** Slots for one host-local day, as ISO strings. */
const iso = (q: SlotQuery) => computeSlots(q).map((s) => s.startAt.toISOString());

// 2026-01-05 is a Monday.
const MONDAY = { from: new Date("2026-01-05T00:00:00Z"), to: new Date("2026-01-06T00:00:00Z") };

describe("weekly hours (F1.1)", () => {
  it("offers back-to-back slots across the working day", () => {
    const slots = iso(query(MONDAY));
    expect(slots).toHaveLength(16);
    expect(slots[0]).toBe("2026-01-05T09:00:00.000Z");
    expect(slots.at(-1)).toBe("2026-01-05T16:30:00.000Z");
  });

  it("supports multiple ranges per day with a gap", () => {
    const weekly: WeeklyRange[] = [
      { weekday: 1, start: "09:00", end: "10:00" },
      { weekday: 1, start: "14:00", end: "15:00" },
    ];
    expect(iso(query({ ...MONDAY, weekly }))).toEqual([
      "2026-01-05T09:00:00.000Z",
      "2026-01-05T09:30:00.000Z",
      "2026-01-05T14:00:00.000Z",
      "2026-01-05T14:30:00.000Z",
    ]);
  });

  it("offers nothing on days without hours", () => {
    // 2026-01-03 is a Saturday.
    const sat = { from: new Date("2026-01-03T00:00:00Z"), to: new Date("2026-01-04T00:00:00Z") };
    expect(iso(query(sat))).toEqual([]);
  });

  it("never offers a slot that runs past the end of a range", () => {
    const weekly: WeeklyRange[] = [{ weekday: 1, start: "09:00", end: "10:15" }];
    const q = query({ ...MONDAY, weekly, rules: { ...rules, durationMin: 45 } });
    expect(iso(q)).toEqual(["2026-01-05T09:00:00.000Z"]);
  });

  it("uses the slot step when given", () => {
    const weekly: WeeklyRange[] = [{ weekday: 1, start: "09:00", end: "10:00" }];
    const q = query({ ...MONDAY, weekly, rules: { ...rules, durationMin: 30, slotStepMin: 15 } });
    expect(iso(q)).toEqual([
      "2026-01-05T09:00:00.000Z",
      "2026-01-05T09:15:00.000Z",
      "2026-01-05T09:30:00.000Z",
    ]);
  });

  it("supports an end time of 24:00", () => {
    const weekly: WeeklyRange[] = [{ weekday: 1, start: "23:00", end: "24:00" }];
    expect(iso(query({ ...MONDAY, weekly }))).toEqual([
      "2026-01-05T23:00:00.000Z",
      "2026-01-05T23:30:00.000Z",
    ]);
  });

  it("returns slots sorted and only inside [from, to)", () => {
    const q = query({
      from: new Date("2026-01-05T12:00:00Z"),
      to: new Date("2026-01-06T10:00:00Z"),
    });
    const slots = iso(q);
    expect(slots[0]).toBe("2026-01-05T12:00:00.000Z");
    expect(slots.at(-1)).toBe("2026-01-06T09:30:00.000Z");
    expect([...slots].sort()).toEqual(slots);
  });
});

describe("date overrides (F1.2, F1.3)", () => {
  it("a blocked date removes every slot that day", () => {
    const q = query({ ...MONDAY, overrides: [{ date: "2026-01-05", isUnavailable: true }] });
    expect(iso(q)).toEqual([]);
  });

  it("custom hours replace the weekly hours for that date only", () => {
    const q = query({
      from: new Date("2026-01-05T00:00:00Z"),
      to: new Date("2026-01-07T00:00:00Z"),
      overrides: [
        { date: "2026-01-05", isUnavailable: false, ranges: [{ start: "18:00", end: "19:00" }] },
      ],
    });
    const slots = iso(q);
    expect(slots.filter((s) => s.startsWith("2026-01-05"))).toEqual([
      "2026-01-05T18:00:00.000Z",
      "2026-01-05T18:30:00.000Z",
    ]);
    expect(slots.filter((s) => s.startsWith("2026-01-06"))).toHaveLength(16);
  });

  it("can add hours on a day with no weekly hours", () => {
    const sat = { from: new Date("2026-01-03T00:00:00Z"), to: new Date("2026-01-04T00:00:00Z") };
    const q = query({
      ...sat,
      overrides: [
        { date: "2026-01-03", isUnavailable: false, ranges: [{ start: "10:00", end: "11:00" }] },
      ],
    });
    expect(iso(q)).toEqual(["2026-01-03T10:00:00.000Z", "2026-01-03T10:30:00.000Z"]);
  });

  it("a block wins if a date has both a block and hours", () => {
    const q = query({
      ...MONDAY,
      overrides: [
        { date: "2026-01-05", isUnavailable: false, ranges: [{ start: "10:00", end: "11:00" }] },
        { date: "2026-01-05", isUnavailable: true },
      ],
    });
    expect(iso(q)).toEqual([]);
  });
});

describe("existing bookings and buffers (F1.4)", () => {
  const booking = {
    startAt: new Date("2026-01-05T10:00:00Z"),
    endAt: new Date("2026-01-05T10:30:00Z"),
  };

  it("hides slots that overlap an existing booking", () => {
    const slots = iso(query({ ...MONDAY, busy: [booking] }));
    expect(slots).not.toContain("2026-01-05T10:00:00.000Z");
    expect(slots).toContain("2026-01-05T09:30:00.000Z");
    expect(slots).toContain("2026-01-05T10:30:00.000Z");
  });

  it("applies buffer before and after", () => {
    const q = query({
      ...MONDAY,
      busy: [booking],
      rules: { ...rules, bufferBeforeMin: 15, bufferAfterMin: 15 },
    });
    const slots = iso(q);
    // 09:30 ends at 10:00, leaving no 15 min after it; 10:30 starts with no 15 min before it.
    expect(slots).not.toContain("2026-01-05T09:30:00.000Z");
    expect(slots).not.toContain("2026-01-05T10:30:00.000Z");
    expect(slots).toContain("2026-01-05T09:00:00.000Z");
    expect(slots).toContain("2026-01-05T11:00:00.000Z");
  });

  it("handles a long booking that spans several slots", () => {
    const long = {
      startAt: new Date("2026-01-05T09:00:00Z"),
      endAt: new Date("2026-01-05T16:00:00Z"),
    };
    expect(iso(query({ ...MONDAY, busy: [long] }))).toEqual([
      "2026-01-05T16:00:00.000Z",
      "2026-01-05T16:30:00.000Z",
    ]);
  });
});

describe("notice, window and daily cap (F1.5)", () => {
  it("hides slots inside the minimum notice", () => {
    const q = query({
      ...MONDAY,
      now: new Date("2026-01-05T09:10:00Z"),
      rules: { ...rules, minNoticeMin: 240 },
    });
    expect(iso(q)[0]).toBe("2026-01-05T13:30:00.000Z");
  });

  it("hides slots beyond max days ahead", () => {
    const q = query({
      from: new Date("2026-01-05T00:00:00Z"),
      to: new Date("2026-01-20T00:00:00Z"),
      now: new Date("2026-01-05T00:00:00Z"),
      rules: { ...rules, maxDaysAhead: 2 },
    });
    const days = new Set(iso(q).map((s) => s.slice(0, 10)));
    expect([...days]).toEqual(["2026-01-05", "2026-01-06", "2026-01-07"]);
  });

  it("counts the booking window in the host's calendar days", () => {
    // 23:30 UTC on the 4th is already the 5th in Lagos.
    const q = query({
      hostTimezone: "Africa/Lagos",
      from: new Date("2026-01-05T00:00:00Z"),
      to: new Date("2026-01-10T00:00:00Z"),
      now: new Date("2026-01-04T23:30:00Z"),
      rules: { ...rules, maxDaysAhead: 1 },
    });
    const days = new Set(iso(q).map((s) => s.slice(0, 10)));
    expect([...days]).toEqual(["2026-01-05", "2026-01-06"]);
  });

  it("stops offering slots once the daily cap is reached", () => {
    const busy = [
      { startAt: new Date("2026-01-05T09:00:00Z"), endAt: new Date("2026-01-05T09:30:00Z") },
      { startAt: new Date("2026-01-05T11:00:00Z"), endAt: new Date("2026-01-05T11:30:00Z") },
    ];
    const q = query({
      from: new Date("2026-01-05T00:00:00Z"),
      to: new Date("2026-01-07T00:00:00Z"),
      busy,
      rules: { ...rules, dailyLimit: 2 },
    });
    const slots = iso(q);
    expect(slots.filter((s) => s.startsWith("2026-01-05"))).toEqual([]);
    expect(slots.filter((s) => s.startsWith("2026-01-06"))).toHaveLength(16);
  });

  it("isSlotAvailable re-checks a single start time on the server", () => {
    const base = query({ busy: [], now: new Date("2026-01-05T08:00:00Z") });
    expect(isSlotAvailable(base, new Date("2026-01-05T09:00:00Z"))).toBe(true);
    expect(isSlotAvailable(base, new Date("2026-01-05T09:10:00Z"))).toBe(false); // off-grid
    expect(isSlotAvailable(base, new Date("2026-01-05T17:00:00Z"))).toBe(false); // after hours
    const withNotice = { ...base, rules: { ...rules, minNoticeMin: 120 } };
    expect(isSlotAvailable(withNotice, new Date("2026-01-05T09:00:00Z"))).toBe(false);
  });
});

/** The PRD's DST suite (§9): hosts' wall-clock hours must survive offset changes (F1.6). */
describe("time zones and DST (F1.6)", () => {
  const firstSlotOn = (tz: string, localDate: string) => {
    const q = query({
      hostTimezone: tz,
      // A local date spans UTC−14…UTC+14, so search a window comfortably around it.
      from: new Date(new Date(`${localDate}T00:00:00Z`).getTime() - 86_400_000),
      to: new Date(new Date(`${localDate}T00:00:00Z`).getTime() + 2 * 86_400_000),
    });
    return computeSlots(q).find(
      (s) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: tz, dateStyle: "short" }).format(s.startAt) ===
        localDate,
    );
  };

  it("America/New_York: 09:00 stays 09:00 across spring-forward (8 Mar 2026)", () => {
    expect(firstSlotOn("America/New_York", "2026-03-06")?.startAt.toISOString()).toBe(
      "2026-03-06T14:00:00.000Z", // EST, UTC−5
    );
    expect(firstSlotOn("America/New_York", "2026-03-09")?.startAt.toISOString()).toBe(
      "2026-03-09T13:00:00.000Z", // EDT, UTC−4
    );
  });

  it("America/New_York: overnight hours on the transition night give real elapsed slots", () => {
    // 00:00–05:00 local on 8 Mar is only 4 real hours (02:00–03:00 doesn't exist).
    const q = query({
      hostTimezone: "America/New_York",
      weekly: [{ weekday: 0, start: "00:00", end: "05:00" }],
      from: new Date("2026-03-08T00:00:00Z"),
      to: new Date("2026-03-09T00:00:00Z"),
      rules: { ...rules, durationMin: 60 },
    });
    expect(iso(q)).toEqual([
      "2026-03-08T05:00:00.000Z", // 00:00 EST
      "2026-03-08T06:00:00.000Z", // 01:00 EST
      "2026-03-08T07:00:00.000Z", // 03:00 EDT
      "2026-03-08T08:00:00.000Z", // 04:00 EDT
    ]);
  });

  it("Europe/London: 09:00 stays 09:00 across fall-back (25 Oct 2026)", () => {
    expect(firstSlotOn("Europe/London", "2026-10-23")?.startAt.toISOString()).toBe(
      "2026-10-23T08:00:00.000Z", // BST, UTC+1
    );
    expect(firstSlotOn("Europe/London", "2026-10-26")?.startAt.toISOString()).toBe(
      "2026-10-26T09:00:00.000Z", // GMT, UTC+0
    );
  });

  it("Europe/London: hours on the fall-back night include the repeated hour once", () => {
    // 00:00–03:00 local on 25 Oct is 4 real hours (01:00–02:00 happens twice).
    const q = query({
      hostTimezone: "Europe/London",
      weekly: [{ weekday: 0, start: "00:00", end: "03:00" }],
      from: new Date("2026-10-24T00:00:00Z"),
      to: new Date("2026-10-26T00:00:00Z"),
      rules: { ...rules, durationMin: 60 },
    });
    expect(iso(q)).toEqual([
      "2026-10-24T23:00:00.000Z", // 00:00 BST
      "2026-10-25T00:00:00.000Z", // 01:00 BST
      "2026-10-25T01:00:00.000Z", // 01:00 GMT
      "2026-10-25T02:00:00.000Z", // 02:00 GMT
    ]);
  });

  it("Africa/Lagos (no DST) is UTC+1 all year", () => {
    expect(firstSlotOn("Africa/Lagos", "2026-01-05")?.startAt.toISOString()).toBe(
      "2026-01-05T08:00:00.000Z",
    );
    expect(firstSlotOn("Africa/Lagos", "2026-07-06")?.startAt.toISOString()).toBe(
      "2026-07-06T08:00:00.000Z",
    );
  });

  it("Australia/Sydney: 09:00 stays 09:00 when DST ends (5 Apr 2026)", () => {
    expect(firstSlotOn("Australia/Sydney", "2026-04-03")?.startAt.toISOString()).toBe(
      "2026-04-02T22:00:00.000Z", // AEDT, UTC+11
    );
    expect(firstSlotOn("Australia/Sydney", "2026-04-06")?.startAt.toISOString()).toBe(
      "2026-04-05T23:00:00.000Z", // AEST, UTC+10
    );
  });

  it("Australia/Sydney: 09:00 stays 09:00 when DST starts (4 Oct 2026)", () => {
    expect(firstSlotOn("Australia/Sydney", "2026-10-02")?.startAt.toISOString()).toBe(
      "2026-10-01T23:00:00.000Z", // AEST, UTC+10
    );
    expect(firstSlotOn("Australia/Sydney", "2026-10-05")?.startAt.toISOString()).toBe(
      "2026-10-04T22:00:00.000Z", // AEDT, UTC+11
    );
  });

  it("a host-local Monday maps to the right UTC day for far-off zones", () => {
    // Monday 09:00 in Sydney is Sunday 22:00 UTC; it must come from Monday's hours.
    const q = query({
      hostTimezone: "Australia/Sydney",
      weekly: [{ weekday: 1, start: "09:00", end: "09:30" }],
      from: new Date("2026-01-04T00:00:00Z"),
      to: new Date("2026-01-06T00:00:00Z"),
    });
    expect(iso(q)).toEqual(["2026-01-04T22:00:00.000Z"]);
  });
});
