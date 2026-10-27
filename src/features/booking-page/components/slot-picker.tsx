"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { selectClass } from "./field";

const DAY = 86_400_000;
const WINDOW_DAYS = 31;

/** Date and time formatters for one zone, shared by the booking and reschedule flows. */
export function useSlotFormatters(timeZone: string | null) {
  return useMemo(() => {
    if (!timeZone) return null;
    return {
      key: new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
      day: new Intl.DateTimeFormat(undefined, {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
      longDay: new Intl.DateTimeFormat(undefined, {
        timeZone,
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      time: new Intl.DateTimeFormat(undefined, { timeZone, hour: "numeric", minute: "2-digit" }),
    };
  }, [timeZone]);
}

export type SlotFormatters = NonNullable<ReturnType<typeof useSlotFormatters>>;

/** The viewer's own zone, read after mount so the server render stays deterministic. */
export function useBrowserTimeZone(initial: string | null = null) {
  const [timeZone, setTimeZone] = useState<string | null>(initial);
  useEffect(() => {
    if (!initial) setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [initial]);
  return [timeZone, setTimeZone] as const;
}

export interface SlotPickerProps {
  timeZone: string | null;
  onTimeZoneChange: (tz: string) => void;
  /** Returns UTC ISO start times in [from, to), or null when the request failed. */
  fetchSlots: (from: Date, to: Date) => Promise<string[] | null>;
  maxDaysAhead: number;
  onPick: (slot: string) => void;
  /** Bump to reload, e.g. after a slot was taken. */
  reloadKey?: number;
  notice?: string | null;
  heading: React.ReactNode;
}

/**
 * Days and times to choose from, in a zone the viewer can change (F2.3). Slots are UTC
 * instants grouped by the viewer's local date.
 */
export function SlotPicker(props: SlotPickerProps) {
  const { timeZone, onTimeZoneChange, fetchSlots, maxDaysAhead, onPick, reloadKey, notice } = props;
  const [windowStart, setWindowStart] = useState<number | null>(null);
  const [firstWindow, setFirstWindow] = useState<number | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const fmt = useSlotFormatters(timeZone);

  useEffect(() => {
    const now = Date.now();
    setWindowStart(now);
    setFirstWindow(now);
  }, []);

  const load = useCallback(async () => {
    if (windowStart === null) return;
    setSlots(null);
    setLoadError(null);
    try {
      const result = await fetchSlots(
        new Date(windowStart),
        new Date(windowStart + WINDOW_DAYS * DAY),
      );
      if (!result) throw new Error("No slots");
      setSlots(result);
    } catch {
      setLoadError("We couldn't load available times. Check your connection and try again.");
    }
  }, [fetchSlots, windowStart]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const byDate = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!slots || !fmt) return map;
    for (const s of slots) {
      const key = fmt.key.format(new Date(s));
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [slots, fmt]);

  // Keep the selected date valid as slots or the time zone change.
  useEffect(() => {
    if (byDate.size === 0) return setSelectedDate(null);
    if (!selectedDate || !byDate.has(selectedDate))
      setSelectedDate(byDate.keys().next().value ?? null);
  }, [byDate, selectedDate]);

  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf("timeZone");
    return timeZone && !all.includes(timeZone) ? [timeZone, ...all] : all;
  }, [timeZone]);

  const lastBookable = firstWindow === null ? 0 : firstWindow + (maxDaysAhead + 1) * DAY;
  const canGoBack = windowStart !== null && firstWindow !== null && windowStart > firstWindow;
  const canGoForward = windowStart !== null && windowStart + WINDOW_DAYS * DAY < lastBookable;

  const dates = [...byDate.keys()];
  const times = selectedDate ? (byDate.get(selectedDate) ?? []) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {props.heading}
        <div className="flex flex-col gap-1">
          <label htmlFor="invitee-tz" className="text-muted-foreground text-sm">
            Times are shown in
          </label>
          <select
            id="invitee-tz"
            className={`${selectClass} max-w-sm`}
            value={timeZone ?? ""}
            onChange={(e) => onTimeZoneChange(e.target.value)}
            disabled={!timeZone}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      {notice && (
        <div
          role="alert"
          className="border-destructive/40 bg-destructive/5 rounded-md border p-3 text-sm"
        >
          {notice}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canGoBack}
          onClick={() => setWindowStart((w) => Math.max(firstWindow!, w! - WINDOW_DAYS * DAY))}
        >
          <ChevronLeft /> Earlier
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canGoForward}
          onClick={() => setWindowStart((w) => w! + WINDOW_DAYS * DAY)}
        >
          Later <ChevronRight />
        </Button>
      </div>

      {loadError ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm">
          {loadError}
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : slots === null || !fmt ? (
        <p className="text-muted-foreground text-sm" role="status">
          Loading available times…
        </p>
      ) : dates.length === 0 ? (
        <p className="text-muted-foreground text-sm" role="status">
          No times available in this period.{canGoForward ? " Try later dates." : ""}
        </p>
      ) : (
        <>
          <div role="group" aria-label="Available days" className="flex flex-wrap gap-2">
            {dates.map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={d === selectedDate ? "default" : "outline"}
                aria-pressed={d === selectedDate}
                onClick={() => setSelectedDate(d)}
              >
                {fmt.day.format(new Date(byDate.get(d)![0]!))}
              </Button>
            ))}
          </div>
          <div
            role="group"
            aria-label="Available times"
            className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          >
            {times.map((s) => (
              <Button key={s} type="button" variant="outline" onClick={() => onPick(s)}>
                {fmt.time.format(new Date(s))}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
