import { describe, expect, it } from "vitest";
import { scrubObject, scrubTokens } from "./scrub";

describe("scrubTokens", () => {
  it("hides manage-link tokens in URLs", () => {
    expect(scrubTokens("https://slotwise.app/manage/AbC_123-xyz456789?action=cancel")).toBe(
      "https://slotwise.app/manage/[token]?action=cancel",
    );
    expect(
      scrubObject({ request: { url: "/manage/abcdefghijk" }, tags: ["/manage/zzzzzzzzzz"] }),
    ).toEqual({ request: { url: "/manage/[token]" }, tags: ["/manage/[token]"] });
  });

  it("leaves other URLs alone", () => {
    expect(scrubTokens("/dashboard/manage")).toBe("/dashboard/manage");
  });
});
