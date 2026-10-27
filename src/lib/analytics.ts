import "server-only";
import { PostHog } from "posthog-node";
import { env } from "@/env";
import { log } from "./log";

const globalForAnalytics = globalThis as unknown as { posthog?: PostHog | null };

function client(): PostHog | null {
  if (globalForAnalytics.posthog !== undefined) return globalForAnalytics.posthog;
  const e = env();
  globalForAnalytics.posthog = e.NEXT_PUBLIC_POSTHOG_KEY
    ? new PostHog(e.NEXT_PUBLIC_POSTHOG_KEY, { host: e.NEXT_PUBLIC_POSTHOG_HOST })
    : null;
  return globalForAnalytics.posthog;
}

/**
 * Server-side product events for the onboarding and booking funnels (PRD §3 metrics). Keyed
 * by the host's user id; never includes invitee names or emails. Never throws.
 */
export async function trackServer(
  hostId: string,
  event: AnalyticsEvent,
  properties: Record<string, string | number | boolean | null> = {},
) {
  const ph = client();
  if (!ph) return;
  try {
    await ph.captureImmediate({ distinctId: hostId, event, properties });
  } catch (error) {
    log.warn("analytics event failed", { event, error });
  }
}

export type AnalyticsEvent =
  | "host_signed_up"
  | "availability_saved"
  | "username_set"
  | "meeting_type_created"
  | "booking_created"
  | "booking_rescheduled"
  | "booking_cancelled"
  | "booking_no_show"
  | "account_deleted";
