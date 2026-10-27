import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { MemoryLimiter } = await import("./rate-limit");

describe("MemoryLimiter", () => {
  it("allows up to the limit in a window, then blocks until it resets", () => {
    const limiter = new MemoryLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(limiter.check("ip", 3, 60, t0).ok).toBe(true);
    const blocked = limiter.check("ip", 3, 60, t0 + 10_000);
    expect(blocked).toEqual({ ok: false, retryAfter: 50 });
    expect(limiter.check("ip", 3, 60, t0 + 60_000).ok).toBe(true);
  });

  it("counts each key separately", () => {
    const limiter = new MemoryLimiter();
    expect(limiter.check("a", 1, 60, 0).ok).toBe(true);
    expect(limiter.check("a", 1, 60, 0).ok).toBe(false);
    expect(limiter.check("b", 1, 60, 0).ok).toBe(true);
  });
});
