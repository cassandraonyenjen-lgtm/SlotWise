"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TimeRange } from "../types";

/** A list of start–end time inputs with add/remove, shared by weekly hours and date overrides. */
export function TimeRangeFields({
  ranges,
  onChange,
  label,
  errors,
  errorPrefix,
  addLabel = "Add hours",
}: {
  ranges: TimeRange[];
  onChange: (ranges: TimeRange[]) => void;
  /** Accessible name prefix, e.g. "Monday". */
  label: string;
  errors: Record<string, string>;
  /** Dotted path the server uses for these ranges, e.g. "days.1". */
  errorPrefix: string;
  addLabel?: string;
}) {
  const update = (index: number, patch: Partial<TimeRange>) =>
    onChange(ranges.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const addRange = () => {
    const last = ranges.at(-1);
    onChange([...ranges, last ? nextRange(last) : { start: "09:00", end: "17:00" }]);
  };

  return (
    <div className="flex flex-col gap-2">
      {ranges.map((range, i) => {
        const error =
          errors[`${errorPrefix}.${i}.start`] ??
          errors[`${errorPrefix}.${i}.end`] ??
          errors[`${errorPrefix}.${i}`];
        const errorId = error ? `${errorPrefix}-${i}-error` : undefined;
        return (
          <div key={i} className="flex flex-col gap-1">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-1.5 sm:flex sm:gap-2">
              <Input
                type="time"
                step={300}
                value={range.start}
                onChange={(e) => update(i, { start: e.target.value })}
                aria-label={`${label} start time ${i + 1}`}
                aria-invalid={Boolean(error)}
                aria-describedby={errorId}
                className="px-2 text-sm sm:w-36 sm:px-3 md:text-sm max-sm:[&::-webkit-calendar-picker-indicator]:hidden"
              />
              <span aria-hidden className="text-muted-foreground">
                –
              </span>
              <Input
                type="time"
                step={300}
                value={range.end}
                onChange={(e) => update(i, { end: e.target.value })}
                aria-label={`${label} end time ${i + 1}`}
                aria-invalid={Boolean(error)}
                aria-describedby={errorId}
                className="px-2 text-sm sm:w-36 sm:px-3 md:text-sm max-sm:[&::-webkit-calendar-picker-indicator]:hidden"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(ranges.filter((_, j) => j !== i))}
                aria-label={`Remove ${label} hours ${range.start}–${range.end}`}
              >
                <Trash2 />
              </Button>
            </div>
            {error && (
              <p id={errorId} className="text-destructive text-sm">
                {error}
              </p>
            )}
          </div>
        );
      })}
      <div>
        <Button type="button" variant="link" size="sm" className="px-0" onClick={addRange}>
          + {addLabel}
        </Button>
      </div>
    </div>
  );
}

/** Suggests the hour after the last range so adding a second block doesn't start out overlapping. */
function nextRange(last: TimeRange): TimeRange {
  const [h, m] = last.end.split(":").map(Number) as [number, number];
  const startH = Math.min(h + 1, 22);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { start: `${pad(startH)}:${pad(m)}`, end: `${pad(Math.min(startH + 1, 23))}:${pad(m)}` };
}
