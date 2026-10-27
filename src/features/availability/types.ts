/** Wall-clock time "HH:mm" in the host's zone. "24:00" is allowed as an end time (midnight). */
export type WallTime = string;

export interface TimeRange {
  start: WallTime;
  end: WallTime;
}

export interface WeeklyRange extends TimeRange {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

/** One local date (YYYY-MM-DD) whose hours replace the weekly hours (F1.2, F1.3). */
export type DateOverride =
  | { date: string; isUnavailable: true }
  | { date: string; isUnavailable: false; ranges: TimeRange[] };

export interface BookingRules {
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  maxDaysAhead: number;
  /** Max bookings on one host-local day, counting all of the host's bookings. Null = no cap. */
  dailyLimit: number | null;
  /** Gap between offered start times. Defaults to the meeting duration. */
  slotStepMin?: number;
}

export interface BusyInterval {
  startAt: Date;
  endAt: Date;
}

export interface Slot {
  startAt: Date;
  endAt: Date;
}

export interface SlotQuery {
  hostTimezone: string;
  weekly: WeeklyRange[];
  overrides: DateOverride[];
  rules: BookingRules;
  /** The host's existing live bookings. */
  busy: BusyInterval[];
  /** Only slots starting in [from, to) are returned. */
  from: Date;
  to: Date;
  now: Date;
}
