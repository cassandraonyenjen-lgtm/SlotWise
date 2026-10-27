import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { env } from "@/env";
import { log } from "./log";

/**
 * Limits on public, unauthenticated endpoints (PRD §8 Security). Keyed by client IP. Generous
 * enough for a real person; tight enough to stop scripted booking spam and token guessing.
 */
export const LIMITS = {
  slots: { limit: 300, windowSec: 60 },
  booking: { limit: 20, windowSec: 600 },
  manage: { limit: 100, windowSec: 600 },
  signIn: { limit: 5, windowSec: 600 },
} as const;

export type LimitName = keyof typeof LIMITS;

export interface LimitResult {
  ok: boolean;
  /** Seconds until the window resets, for Retry-After. */
  retryAfter: number;
}

export const RATE_LIMITED_MESSAGE = "Too many requests. Please wait a few minutes and try again.";

/** Fixed-window counter for one process. Used when Upstash isn't configured (dev, CI). */
export class MemoryLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  check(key: string, limit: number, windowSec: number, now = Date.now()): LimitResult {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowSec * 1000 });
      if (this.hits.size > 10_000) this.sweep(now);
      return { ok: true, retryAfter: 0 };
    }
    entry.count++;
    return {
      ok: entry.count <= limit,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  private sweep(now: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

const globalForLimits = globalThis as unknown as {
  memoryLimiter?: MemoryLimiter;
  upstash?: Map<LimitName, Ratelimit>;
};

function upstashFor(name: LimitName): Ratelimit | null {
  const e = env();
  if (!e.UPSTASH_REDIS_REST_URL || !e.UPSTASH_REDIS_REST_TOKEN) return null;
  globalForLimits.upstash ??= new Map();
  let limiter = globalForLimits.upstash.get(name);
  if (!limiter) {
    const { limit, windowSec } = LIMITS[name];
    limiter = new Ratelimit({
      redis: new Redis({ url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN }),
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: `slotwise:rl:${name}`,
    });
    globalForLimits.upstash.set(name, limiter);
  }
  return limiter;
}

/** The caller's IP as the platform reports it. Vercel and most proxies set x-forwarded-for. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
}

export async function rateLimit(name: LimitName, key?: string): Promise<LimitResult> {
  const id = key ?? (await clientIp());
  const upstash = upstashFor(name);
  if (upstash) {
    try {
      const result = await upstash.limit(id);
      return {
        ok: result.success,
        retryAfter: Math.max(0, Math.ceil((result.reset - Date.now()) / 1000)),
      };
    } catch (error) {
      // Fail open: a Redis outage must not take booking pages down with it.
      log.error("rate limiter unavailable, allowing request", { limit: name, error });
      return { ok: true, retryAfter: 0 };
    }
  }
  globalForLimits.memoryLimiter ??= new MemoryLimiter();
  const { limit, windowSec } = LIMITS[name];
  return globalForLimits.memoryLimiter.check(`${name}:${id}`, limit, windowSec);
}
