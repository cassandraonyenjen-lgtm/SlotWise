/** Manage-link tokens grant access to a booking, so they must never reach logs or vendors. */
const MANAGE_TOKEN = /\/manage\/[A-Za-z0-9_-]{8,}/g;

export function scrubTokens(value: string): string {
  return value.replace(MANAGE_TOKEN, "/manage/[token]");
}

/** Deep-scrubs a JSON-safe object such as a Sentry event or breadcrumb. */
export function scrubObject<T>(value: T): T {
  if (value == null) return value;
  return JSON.parse(scrubTokens(JSON.stringify(value))) as T;
}
