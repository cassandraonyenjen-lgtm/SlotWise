import { describe, expect, it } from "vitest";
import { usernameSchema } from "./usernames";

describe("usernameSchema", () => {
  it.each(["jane", "jane-doe", "studio42"])("accepts %s", (u) => {
    expect(usernameSchema.safeParse(u).success).toBe(true);
  });

  it("normalises case and whitespace", () => {
    expect(usernameSchema.parse("  Jane ")).toBe("jane");
  });

  it.each(["dashboard", "api", "sign-in", "manage"])("rejects reserved word %s", (u) => {
    expect(usernameSchema.safeParse(u).success).toBe(false);
  });

  it.each(["ab", "-jane", "jane-", "jane_doe", "jané"])("rejects malformed %s", (u) => {
    expect(usernameSchema.safeParse(u).success).toBe(false);
  });
});
