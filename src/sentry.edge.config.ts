import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "./sentry.shared";

// No DSN, no Sentry: local dev and CI run without it.
if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, ...sharedSentryOptions });
}
