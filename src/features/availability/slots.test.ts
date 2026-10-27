import { describe, it } from "vitest";

// Phase 1 fills these in. They're the PRD's DST test suite (§9 v1 DoD).
describe("computeSlots", () => {
  it.todo("returns slots inside weekly hours with multiple ranges per day");
  it.todo("full-day override removes all slots for that date");
  it.todo("hours override replaces weekly hours for that date only");
  it.todo("applies buffer before/after around existing bookings");
  it.todo("hides slots inside minimum notice and beyond max days ahead");
  it.todo("stops offering slots once the daily cap is reached");
  it.todo("keeps 09:00 local across the spring-forward transition in America/New_York");
  it.todo("keeps 09:00 local across the fall-back transition in Europe/London");
  it.todo("handles Africa/Lagos (no DST) consistently");
  it.todo("handles Australia/Sydney (southern-hemisphere DST)");
});
