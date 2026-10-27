// Kept free of the `ics` package so client components can import it cheaply.

/** What an "Add to calendar" button needs. All times are UTC instants. */
export interface CalendarEvent {
  uid: string;
  sequence: number;
  title: string;
  description: string;
  location: string;
  startAt: Date;
  endAt: Date;
  organizer?: { name: string; email: string };
}

const compact = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${compact(event.startAt)}/${compact(event.endAt)}`,
    details: event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: event.startAt.toISOString(),
    enddt: event.endAt.toISOString(),
    body: event.description,
    location: event.location,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}
