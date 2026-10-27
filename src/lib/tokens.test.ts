import { describe, expect, it } from "vitest";
import { generateManageToken, hashManageToken } from "./tokens";

describe("manage tokens", () => {
  it("has at least 128 bits of entropy (F5.5)", () => {
    const { token } = generateManageToken();
    expect(Buffer.from(token, "base64url").length * 8).toBeGreaterThanOrEqual(128);
  });

  it("stores a hash, not the token", () => {
    const { token, hash } = generateManageToken();
    expect(hash).not.toContain(token);
    expect(hash).toBe(hashManageToken(token));
  });

  it("is unique per call", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateManageToken().token));
    expect(tokens.size).toBe(100);
  });
});
