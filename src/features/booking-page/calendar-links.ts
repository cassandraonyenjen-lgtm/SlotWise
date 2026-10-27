import { createEvent } from "ics";
import type { CalendarEvent } from "./calendar-urls";

export type { CalendarEvent } from "./calendar-urls";
export { googleCalendarUrl, outlookCalendarUrl } from "./calendar-urls";

export interface IcsOptions {
  /** REQUEST for new or moved meetings, CANCEL to remove the event from calendars. */
  method?: "REQUEST" | "CANCEL";
  attendee?: { name: string; email: string };
}

/**
 * Standards-compliant .ics text. The UID never changes for a booking and SEQUENCE goes up with
 * every change, so calendar apps update or cancel the original event instead of adding a new
 * one (F4.4).
 */
export function buildIcs(event: CalendarEvent, options: IcsOptions = {}): string {
  const method = options.method ?? "REQUEST";
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
    status: method === "CANCEL" ? "CANCELLED" : "CONFIRMED",
    method,
    productId: "slotwise/ics",
    ...(event.organizer ? { organizer: event.organizer } : {}),
    ...(options.attendee
      ? {
          attendees: [
            {
              ...options.attendee,
              rsvp: false,
              partstat: "ACCEPTED" as const,
              role: "REQ-PARTICIPANT" as const,
            },
          ],
        }
      : {}),
  });
  if (error || !value) throw error ?? new Error("Could not build calendar file");
  return value;
}
