import { z } from "zod";

export const MAX_NOTE_LENGTH = 500;

const note = z
  .string()
  .trim()
  .max(MAX_NOTE_LENGTH, `Keep it under ${MAX_NOTE_LENGTH} characters.`)
  .optional()
  .default("");

export const cancelSchema = z.object({ reason: note });

export const rescheduleSchema = z.object({
  startAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  message: note,
});

export const slotWindowSchema = z.object({
  from: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  to: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
});

export const bookingIdSchema = z.uuid();

/** Choices for how close to the meeting invitees can still change it online (F5.4). */
export const CUTOFF_OPTIONS = [
  { minutes: 0, label: "Any time before the meeting" },
  { minutes: 60, label: "Up to 1 hour before" },
  { minutes: 120, label: "Up to 2 hours before" },
  { minutes: 240, label: "Up to 4 hours before" },
  { minutes: 720, label: "Up to 12 hours before" },
  { minutes: 1440, label: "Up to 24 hours before" },
  { minutes: 2880, label: "Up to 48 hours before" },
] as const;

export const cutoffSchema = z.object({
  cancelCutoffMin: z.coerce
    .number()
    .int()
    .refine((n) => CUTOFF_OPTIONS.some((o) => o.minutes === n), "Choose one of the options."),
});
