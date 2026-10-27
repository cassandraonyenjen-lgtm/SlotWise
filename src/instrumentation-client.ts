import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "./sentry.shared";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, ...sharedSentryOptions });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
