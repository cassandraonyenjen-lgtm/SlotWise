"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeDateOverrideAction, saveDateOverrideAction, type FieldErrors } from "../actions";
import { dateOverrideSchema } from "../schemas";
import type { DateOverride, TimeRange } from "../types";
import { TimeRangeFields } from "./time-range-fields";

type Mode = "unavailable" | "hours";

export function DateOverrides({ overrides, today }: { overrides: DateOverride[]; today: string }) {
  const [mode, setMode] = useState<Mode>("unavailable");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [ranges, setRanges] = useState<TimeRange[]>([{ start: "09:00", end: "12:00" }]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input =
      mode === "unavailable"
        ? { kind: "unavailable" as const, from, to: to || from }
        : { kind: "hours" as const, date: from, ranges };
    const parsed = dateOverrideSchema.safeParse(input);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) next[issue.path.join(".")] ??= issue.message;
      setErrors(next);
      setMessage({ kind: "error", text: parsed.error.issues[0]?.message ?? "Check the dates" });
      return;
    }
    startTransition(async () => {
      const result = await saveDateOverrideAction(parsed.data);
      if (result.ok) {
        setErrors({});
        setMessage({
          kind: "ok",
          text: mode === "unavailable" ? "Dates blocked." : "Hours for that date saved.",
        });
      } else {
        setErrors(result.fieldErrors ?? {});
        setMessage({ kind: "error", text: result.error });
      }
    });
  };

  const remove = (date: string) =>
    startTransition(async () => {
      const result = await removeDateOverrideAction(date);
      setMessage(
        result.ok
          ? { kind: "ok", text: `${formatDate(date)} uses your weekly hours again.` }
          : { kind: "error", text: result.error },
      );
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Date-specific changes</h2>
        </CardTitle>
        <CardDescription>
          Block holidays and time off, or set different hours on one date. These replace your weekly
          hours for that date only.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">Type of change</legend>
            {(
              [
                ["unavailable", "Block dates"],
                ["hours", "Custom hours on a date"],
              ] as const
            ).map(([value, text]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="override-mode"
                  className="accent-primary"
                  checked={mode === value}
                  onChange={() => {
                    setMode(value);
                    setErrors({});
                    setMessage(null);
                  }}
                />
                {text}
              </label>
            ))}
          </fieldset>

          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="override-from">{mode === "unavailable" ? "From" : "Date"}</Label>
              <Input
                id="override-from"
                type="date"
                min={today}
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  if (to < e.target.value) setTo(e.target.value);
                }}
                aria-invalid={Boolean(errors.from || errors.date)}
                className="w-44"
              />
            </div>
            {mode === "unavailable" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="override-to">To</Label>
                <Input
                  id="override-to"
                  type="date"
                  min={from}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-invalid={Boolean(errors.to)}
                  className="w-44"
                />
              </div>
            )}
          </div>

          {mode === "hours" && (
            <TimeRangeFields
              ranges={ranges}
              onChange={setRanges}
              label="Custom"
              errors={errors}
              errorPrefix="ranges"
            />
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {mode === "unavailable" ? "Block these dates" : "Save hours for this date"}
            </Button>
            <p
              role="status"
              className={message?.kind === "error" ? "text-destructive text-sm" : "text-sm"}
            >
              {message?.text}
            </p>
          </div>
        </form>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Upcoming changes</h3>
          {overrides.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              None. Your weekly hours apply every day.
            </p>
          ) : (
            <ul className="divide-y rounded-md border" aria-label="Upcoming date changes">
              {overrides.map((o) => (
                <li key={o.date} className="flex items-center justify-between gap-4 px-3 py-2">
                  <div className="text-sm">
                    <span className="font-medium">{formatDate(o.date)}</span>{" "}
                    <span className="text-muted-foreground">
                      {o.isUnavailable
                        ? "Unavailable all day"
                        : o.ranges.map((r) => `${r.start}–${r.end}`).join(", ")}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => remove(o.date)}
                    aria-label={`Remove change on ${formatDate(o.date)}`}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** "2026-12-24" → "Thu, 24 Dec 2026", independent of the viewer's zone. */
function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
