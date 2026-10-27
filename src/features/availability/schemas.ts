import { z } from "zod";
import { isLocalDate, isValidTimeZone, isWallTime, wallTimeToMinutes } from "./time";

/**
 * Shared by the availability page (client-side feedback) and the server actions
 * (the source of truth). Messages are written for hosts, not developers.
 */

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const timeZoneSchema = z
  .string()
  .min(1, "Choose a time zone")
  .refine(isValidTimeZone, "That isn't a recognised time zone");

const wallTime = z.string().refine(isWallTime, "Use a time like 09:00");

export const timeRangeSchema = z
  .object({ start: wallTime, end: wallTime })
  // Malformed times are already reported on their own field.
  .refine(
    (r) =>
      !isWallTime(r.start) ||
      !isWallTime(r.end) ||
      wallTimeToMinutes(r.start) < wallTimeToMinutes(r.end),
    {
      message: "End time must be after start time",
      path: ["end"],
    },
  );

/** Rejects ranges on the same day that overlap or touch inside each other (F1.1). */
function rejectOverlaps(
  ranges: { start: string; end: string }[],
  ctx: z.RefinementCtx,
  label: string,
  basePath: (string | number)[],
) {
  const sorted = ranges
    .map((r, index) => ({ ...r, index }))
    .filter((r) => isWallTime(r.start) && isWallTime(r.end))
    .sort((a, b) => wallTimeToMinutes(a.start) - wallTimeToMinutes(b.start));
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (wallTimeToMinutes(cur.start) < wallTimeToMinutes(prev.end)) {
      ctx.addIssue({
        code: "custom",
        message: `${label}: ${prev.start}–${prev.end} overlaps ${cur.start}–${cur.end}`,
        path: [...basePath, cur.index, "start"],
      });
    }
  }
}

export const weeklyHoursSchema = z
  .object({
    days: z.array(z.array(timeRangeSchema).max(12, "That's too many ranges for one day")).length(7),
  })
  .superRefine((value, ctx) => {
    value.days.forEach((ranges, weekday) =>
      rejectOverlaps(ranges, ctx, WEEKDAYS[weekday]!, ["days", weekday]),
    );
  });

export type WeeklyHoursInput = z.infer<typeof weeklyHoursSchema>;

const localDate = z.string().refine(isLocalDate, "Use a date like 2026-12-24");

/**
 * Block one date or a span of dates (vacation), or give one date custom hours.
 * A span is capped at a year so a typo can't create thousands of rows.
 */
export const dateOverrideSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("unavailable"), from: localDate, to: localDate })
    .refine((v) => v.from <= v.to, {
      message: "End date must be on or after start date",
      path: ["to"],
    })
    .refine((v) => daysBetween(v.from, v.to) <= 366, {
      message: "Block at most a year at a time",
      path: ["to"],
    }),
  z
    .object({
      kind: z.literal("hours"),
      date: localDate,
      ranges: z.array(timeRangeSchema).min(1, "Add at least one time range").max(12),
    })
    .superRefine((v, ctx) => rejectOverlaps(v.ranges, ctx, v.date, ["ranges"])),
]);

export type DateOverrideInput = z.infer<typeof dateOverrideSchema>;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
