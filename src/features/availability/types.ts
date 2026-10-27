/** Wall-clock time "HH:mm" in the host's zone. */
export type WallTime = `${number}:${number}`;

export interface WeeklyRange {
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
  start: WallTime;
  end: WallTime;
}

export type DateOverride =
  | { date: string; isUnavailable: true }
  | { date: string; isUnavailable: false; start: WallTime; end: WallTime };

export interface BookingRules {
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  maxDaysAhead: number;
  dailyLimit: number | null;
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
  busy: BusyInterval[];
  /** Inclusive UTC window to compute slots for. */
  from: Date;
  to: Date;
  now: Date;
}
