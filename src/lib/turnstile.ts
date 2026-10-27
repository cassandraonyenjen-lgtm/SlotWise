import "server-only";
import { env } from "@/env";
import { log } from "./log";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Checks a Cloudflare Turnstile token from the booking form (PRD: bot protection). Skipped
 * when no secret is configured, so dev and CI work without Cloudflare.
 */
export async function verifyTurnstile(token: unknown, ip?: string): Promise<boolean> {
  const secret = env().TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== "unknown") body.set("remoteip", ip);
    const res = await fetch(VERIFY_URL, { method: "POST", body, cache: "no-store" });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (error) {
    log.error("turnstile verification request failed", { error });
    return false;
  }
}
