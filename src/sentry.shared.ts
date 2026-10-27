import { scrubObject } from "@/lib/scrub";

/** Options every Sentry runtime shares: no PII, and manage-link tokens scrubbed everywhere. */
export const sharedSentryOptions = {
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend: <E>(event: E) => scrubObject(event),
  beforeSendTransaction: <E>(event: E) => scrubObject(event),
  beforeBreadcrumb: <B>(crumb: B) => scrubObject(crumb),
};
