import { TZDate } from "@date-fns/tz";
import { zonedTimeToUtc } from "@/features/availability/time";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * FullCalendar can't render named time zones without an extra plugin, so the calendar runs in
 * "UTC" and we hand it the host's wall-clock times with no offset ("floating"). A 09:00 meeting
 * in Lagos is "…T09:00:00" and shows at 09:00 whatever zone the browser is in.
 */
export function toFloating(instant: Date, tz: string): string {
  const z = new TZDate(instant, tz);
  return `${z.getFullYear()}-${pad(z.getMonth() + 1)}-${pad(z.getDate())}T${pad(z.getHours())}:${pad(z.getMinutes())}:00`;
}

/** The real instant behind a floating time FullCalendar gives back (e.g. a view's range). */
export function fromFloating(floating: string, tz: string): Date {
  const date = floating.slice(0, 10);
  const time = floating.length >= 16 ? floating.slice(11, 16) : "00:00";
  return zonedTimeToUtc(date, time, tz);
}
