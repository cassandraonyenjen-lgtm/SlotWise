import { describe, expect, it } from "vitest";
import { generateManageToken, hashManageToken, manageTokenFor } from "./tokens";

describe("manage tokens (F5.5)", () => {
  it("has at least 128 bits of entropy", () => {
    const token = manageTokenFor("booking-1", "secret");
    expect(Buffer.from(token, "base64url").length * 8).toBeGreaterThanOrEqual(128);
    expect(Buffer.from(generateManageToken().token, "base64url").length * 8).toBeGreaterThanOrEqual(
      128,
    );
  });

  it("is stable per booking, so jobs can rebuild the link", () => {
    expect(manageTokenFor("booking-1", "secret")).toBe(manageTokenFor("booking-1", "secret"));
  });

  it("differs per booking and per secret", () => {
    const a = manageTokenFor("booking-1", "secret");
    expect(manageTokenFor("booking-2", "secret")).not.toBe(a);
    expect(manageTokenFor("booking-1", "other-secret")).not.toBe(a);
  });

  it("stores a hash, not the token", () => {
    const token = manageTokenFor("booking-1", "secret");
    const hash = hashManageToken(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("random tokens are unique per call", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateManageToken().token));
    expect(tokens.size).toBe(100);
  });
});
