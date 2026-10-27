import { createEvent } from "ics";
import type { CalendarEvent } from "./calendar-urls";

export type { CalendarEvent } from "./calendar-urls";
export { googleCalendarUrl, outlookCalendarUrl } from "./calendar-urls";

/** Standards-compliant .ics text with a stable UID, so later updates replace this event (F4.4). */
export function buildIcs(event: CalendarEvent): string {
  const toArray = (d: Date) =>
    [
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
    ] as [number, number, number, number, number];
  const { error, value } = createEvent({
    uid: event.uid,
    sequence: event.sequence,
    title: event.title,
    description: event.description,
    location: event.location,
    start: toArray(event.startAt),
    startInputType: "utc",
    startOutputType: "utc",
    end: toArray(event.endAt),
    endInputType: "utc",
    endOutputType: "utc",
    status: "CONFIRMED",
    productId: "slotwise/ics",
    ...(event.organizer ? { organizer: event.organizer } : {}),
  });
  if (error || !value) throw error ?? new Error("Could not build calendar file");
  return value;
}
