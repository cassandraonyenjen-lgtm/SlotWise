/** Formatting for emails. Every time is rendered in the recipient's own zone (F4.1, F4.2). */

export function zoneLabel(timeZone: string): string {
  return timeZone.replaceAll("_", " ");
}

/** "Tuesday, January 7, 2030, 9:00 AM – 9:30 AM (Africa/Lagos)" */
export function formatMeetingTime(startAt: Date, endAt: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(startAt);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  return `${day}, ${time.format(startAt)} – ${time.format(endAt)} (${zoneLabel(timeZone)})`;
}

/** "Jan 7" style date for subject lines, in the recipient's zone. */
export function formatShortDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(at);
}

/** "Jane Doe via Slotwise <no-reply@slotwise.app>" from EMAIL_FROM's address (F4.5). */
export function fromWithName(emailFrom: string, displayName: string): string {
  const address = /<([^>]+)>/.exec(emailFrom)?.[1] ?? emailFrom.trim();
  const safeName = displayName.replace(/["\\<>\r\n]/g, "").trim();
  return safeName ? `"${safeName} via Slotwise" <${address}>` : `"Slotwise" <${address}>`;
}
