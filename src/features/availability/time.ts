import { TZDate } from "@date-fns/tz";

const WALL_TIME = /^(?:([01]\d|2[0-3]):([0-5]\d)|(24):(00))(?::00)?$/;
const LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "09:30" → 570. Accepts Postgres "09:30:00" and "24:00" (end of day). */
export function wallTimeToMinutes(value: string): number {
  const m = WALL_TIME.exec(value);
  if (!m) throw new Error(`Invalid time "${value}"`);
  const hours = Number(m[1] ?? m[3]);
  const minutes = Number(m[2] ?? m[4]);
  return hours * 60 + minutes;
}

export function isWallTime(value: string): boolean {
  return WALL_TIME.test(value);
}

/** Normalises Postgres "09:30:00" to "09:30". */
export function toWallTime(value: string): string {
  const total = wallTimeToMinutes(value);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function isLocalDate(value: string): boolean {
  const m = LOCAL_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The UTC instant of a wall-clock time on a local date in `tz`.
 * Times inside a spring-forward gap resolve forward (02:30 → 03:30); times inside a
 * fall-back overlap resolve to the first occurrence.
 */
export function zonedTimeToUtc(localDate: string, wallTime: string, tz: string): Date {
  const [y, mo, d] = localDate.split("-").map(Number) as [number, number, number];
  const total = wallTimeToMinutes(wallTime);
  return new Date(+new TZDate(y, mo - 1, d, Math.floor(total / 60), total % 60, tz));
}

/** The host-local calendar date (YYYY-MM-DD) of an instant. */
export function localDateOf(instant: Date, tz: string): string {
  const z = new TZDate(instant, tz);
  return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, "0")}-${String(z.getDate()).padStart(2, "0")}`;
}

/** Calendar arithmetic on YYYY-MM-DD strings (no time zone involved). */
export function addLocalDays(localDate: string, days: number): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(localDate: string): number {
  return new Date(`${localDate}T00:00:00Z`).getUTCDay();
}
