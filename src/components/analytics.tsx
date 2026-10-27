"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import { scrubObject } from "@/lib/scrub";

let started = false;

/**
 * Product analytics (PostHog), only when a key is configured. Cookieless (in-memory
 * persistence), no autocapture of inputs and no session recording, so nothing here needs a
 * consent banner. Manage-link tokens are scrubbed from URLs before anything is sent.
 */
export function Analytics({ apiKey, host }: { apiKey: string | null; host: string }) {
  useEffect(() => {
    if (!apiKey || started) return;
    started = true;
    posthog.init(apiKey, {
      api_host: host,
      persistence: "memory",
      autocapture: false,
      capture_pageview: "history_change",
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: "identified_only",
      before_send: (event) => (event ? scrubObject(event) : event),
    });
  }, [apiKey, host]);
  return null;
}

/** Ties dashboard events to the signed-in host (their id only, never their email). */
export function IdentifyHost({ userId }: { userId: string }) {
  useEffect(() => {
    if (started) posthog.identify(userId);
  }, [userId]);
  return null;
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (started) posthog.capture(event, properties);
}
