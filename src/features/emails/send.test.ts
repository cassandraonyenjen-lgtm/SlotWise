import { describe, expect, it } from "vitest";
import { reminderSchedule } from "./send";

const start = new Date("2030-01-07T09:00:00Z");

describe("reminderSchedule", () => {
  it("follows the host's policy", () => {
    const now = new Date("2030-01-01T00:00:00Z");
    expect(reminderSchedule("off", start, now)).toEqual([]);
    expect(reminderSchedule("24h", start, now)).toEqual([
      { offset: "24h", sendAt: new Date("2030-01-06T09:00:00Z") },
    ]);
    expect(reminderSchedule("1h", start, now)).toEqual([
      { offset: "1h", sendAt: new Date("2030-01-07T08:00:00Z") },
    ]);
    expect(reminderSchedule("both", start, now).map((r) => r.offset)).toEqual(["24h", "1h"]);
  });

  it("drops reminders whose time has passed", () => {
    const threeHoursBefore = new Date("2030-01-07T06:00:00Z");
    expect(reminderSchedule("both", start, threeHoursBefore).map((r) => r.offset)).toEqual(["1h"]);
    const tenMinutesBefore = new Date("2030-01-07T08:50:00Z");
    expect(reminderSchedule("both", start, tenMinutesBefore)).toEqual([]);
  });
});
