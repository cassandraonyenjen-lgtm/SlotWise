import { describe, expect, it } from "vitest";
import { fromFloating, toFloating } from "./floating";

describe("floating times", () => {
  it("shows the host's wall clock", () => {
    expect(toFloating(new Date("2030-01-07T08:00:00Z"), "Africa/Lagos")).toBe(
      "2030-01-07T09:00:00",
    );
    expect(toFloating(new Date("2030-01-07T02:00:00Z"), "America/New_York")).toBe(
      "2030-01-06T21:00:00",
    );
  });

  it("round-trips, including across a DST change", () => {
    for (const iso of ["2030-03-10T06:30:00Z", "2030-03-10T08:00:00Z", "2030-11-03T07:00:00Z"]) {
      const tz = "America/New_York";
      expect(fromFloating(toFloating(new Date(iso), tz), tz).toISOString()).toBe(
        new Date(iso).toISOString(),
      );
    }
  });

  it("accepts a bare date as the start of that day", () => {
    expect(fromFloating("2030-01-07", "Africa/Lagos").toISOString()).toBe(
      "2030-01-06T23:00:00.000Z",
    );
  });
});
