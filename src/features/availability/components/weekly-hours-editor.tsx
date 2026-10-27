"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { saveWeeklyHoursAction, type FieldErrors } from "../actions";
import { WEEKDAYS, weeklyHoursSchema } from "../schemas";
import type { TimeRange, WeeklyRange } from "../types";
import { TimeRangeFields } from "./time-range-fields";

// Shown Monday first; stored with 0 = Sunday.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function WeeklyHoursEditor({ initial }: { initial: WeeklyRange[] }) {
  const [days, setDays] = useState<TimeRange[][]>(() =>
    Array.from({ length: 7 }, (_, weekday) =>
      initial.filter((r) => r.weekday === weekday).map(({ start, end }) => ({ start, end })),
    ),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const setDay = (weekday: number, ranges: TimeRange[]) => {
    setDays((d) => d.map((r, i) => (i === weekday ? ranges : r)));
    setStatus(null);
  };

  const save = () => {
    // Same schema as the server, so most mistakes are caught before a round trip.
    const parsed = weeklyHoursSchema.safeParse({ days });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
      setErrors(next);
      setStatus({ kind: "error", message: "Fix the highlighted hours, then save again." });
      return;
    }
    startTransition(async () => {
      const result = await saveWeeklyHoursAction(parsed.data);
      if (result.ok) {
        setErrors({});
        setStatus({ kind: "saved", message: "Weekly hours saved." });
      } else {
        setErrors(result.fieldErrors ?? {});
        setStatus({ kind: "error", message: result.error });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Weekly hours</h2>
        </CardTitle>
        <CardDescription>
          When clients can book you in a normal week. Add more than one range to leave a gap, like a
          lunch break.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="divide-y">
          {DISPLAY_ORDER.map((weekday) => {
            const name = WEEKDAYS[weekday]!;
            const ranges = days[weekday]!;
            return (
              <li
                key={weekday}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-6"
                data-testid={`weekday-${name.toLowerCase()}`}
              >
                <div className="flex items-center gap-2 sm:w-40 sm:pt-2">
                  <input
                    id={`day-${weekday}`}
                    type="checkbox"
                    className="accent-primary size-4"
                    checked={ranges.length > 0}
                    onChange={(e) =>
                      setDay(weekday, e.target.checked ? [{ start: "09:00", end: "17:00" }] : [])
                    }
                  />
                  <label htmlFor={`day-${weekday}`} className="font-medium">
                    {name}
                  </label>
                </div>
                {ranges.length > 0 ? (
                  <TimeRangeFields
                    ranges={ranges}
                    onChange={(r) => setDay(weekday, r)}
                    label={name}
                    errors={errors}
                    errorPrefix={`days.${weekday}`}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm sm:pt-2">Unavailable</p>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save weekly hours"}
          </Button>
          <p
            role="status"
            className={status?.kind === "error" ? "text-destructive text-sm" : "text-sm"}
          >
            {status?.message}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
