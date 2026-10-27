import { z } from "zod";

export const REMINDER_POLICIES = ["off", "1h", "24h", "both"] as const;

export const REMINDER_LABELS: Record<(typeof REMINDER_POLICIES)[number], string> = {
  off: "No reminders",
  "1h": "1 hour before",
  "24h": "24 hours before",
  both: "24 hours and 1 hour before",
};

export const emailSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter the name clients should see.")
    .max(80, "Keep it under 80 characters."),
  reminderPolicy: z.enum(REMINDER_POLICIES, "Choose when reminders go out."),
});

export type EmailSettings = z.infer<typeof emailSettingsSchema>;
