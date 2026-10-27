import { addLocalDays, localDateOf, wallTimeToMinutes, weekdayOf, zonedTimeToUtc } from "./time";
import type { BusyInterval, DateOverride, Slot, SlotQuery, TimeRange, WeeklyRange } from "./types";

const MINUTE = 60_000;

/**
 * Computes bookable slots for one meeting type. Pure, so it can be tested exhaustively.
 *
 * Availability is evaluated per host-local date: weekly hours (or that date's override) are
 * turned into UTC instants with the host's IANA zone, so DST shifts the UTC times, not the
 * host's wall-clock hours (F1.6). Slots then step through each range in real elapsed time.
 */
export function computeSlots(query: SlotQuery): Slot[] {
  const { hostTimezone: tz, rules, now } = query;
  if (query.to <= query.from) return [];

  const step = (rules.slotStepMin ?? rules.durationMin) * MINUTE;
  const duration = rules.durationMin * MINUTE;
  const earliestStart = now.getTime() + rules.minNoticeMin * MINUTE;
  const lastBookableDate = addLocalDays(localDateOf(now, tz), rules.maxDaysAhead);

  const overridesByDate = groupOverrides(query.overrides);
  const busy = [...query.busy].sort((a, b) => +a.startAt - +b.startAt);
  const bookingsPerDay = countByLocalDate(busy, tz);

  // Pad a day each side: a local date can begin before `from` in UTC terms and vice versa.
  const firstDate = addLocalDays(localDateOf(query.from, tz), -1);
  const lastDate = addLocalDays(localDateOf(query.to, tz), 1);

  const slots: Slot[] = [];
  const seen = new Set<number>();

  for (let date = firstDate; date <= lastDate; date = addLocalDays(date, 1)) {
    if (date > lastBookableDate) break;
    if (rules.dailyLimit !== null && (bookingsPerDay.get(date) ?? 0) >= rules.dailyLimit) continue;

    for (const range of rangesForDate(date, query.weekly, overridesByDate)) {
      const rangeStart = zonedTimeToUtc(date, range.start, tz).getTime();
      const rangeEnd = zonedTimeToUtc(date, range.end, tz).getTime();

      for (let start = rangeStart; start + duration <= rangeEnd; start += step) {
        if (start < earliestStart) continue;
        if (start < query.from.getTime() || start >= query.to.getTime()) continue;
        if (seen.has(start)) continue;

        const end = start + duration;
        const paddedStart = start - rules.bufferBeforeMin * MINUTE;
        const paddedEnd = end + rules.bufferAfterMin * MINUTE;
        if (overlapsAny(busy, paddedStart, paddedEnd)) continue;

        seen.add(start);
        slots.push({ startAt: new Date(start), endAt: new Date(end) });
      }
    }
  }

  return slots.sort((a, b) => +a.startAt - +b.startAt);
}

/** True when `startAt` is one of the slots computeSlots would offer right now (F1.5 server check). */
export function isSlotAvailable(query: Omit<SlotQuery, "from" | "to">, startAt: Date): boolean {
  const slots = computeSlots({
    ...query,
    from: startAt,
    to: new Date(startAt.getTime() + MINUTE),
  });
  return slots.some((s) => s.startAt.getTime() === startAt.getTime());
}

function groupOverrides(overrides: DateOverride[]): Map<string, DateOverride[]> {
  const map = new Map<string, DateOverride[]>();
  for (const o of overrides) map.set(o.date, [...(map.get(o.date) ?? []), o]);
  return map;
}

/** An override replaces that date's weekly hours entirely; a full-day block wins over hours. */
function rangesForDate(
  date: string,
  weekly: WeeklyRange[],
  overridesByDate: Map<string, DateOverride[]>,
): TimeRange[] {
  const overrides = overridesByDate.get(date);
  const ranges = overrides
    ? overrides.some((o) => o.isUnavailable)
      ? []
      : overrides.flatMap((o) => (o.isUnavailable ? [] : o.ranges))
    : weekly.filter((r) => r.weekday === weekdayOf(date));
  return [...ranges].sort((a, b) => wallTimeToMinutes(a.start) - wallTimeToMinutes(b.start));
}

function countByLocalDate(busy: BusyInterval[], tz: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const b of busy) {
    const date = localDateOf(b.startAt, tz);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return counts;
}

function overlapsAny(sortedBusy: BusyInterval[], start: number, end: number): boolean {
  for (const b of sortedBusy) {
    if (b.startAt.getTime() >= end) return false;
    if (b.endAt.getTime() > start) return true;
  }
  return false;
}
