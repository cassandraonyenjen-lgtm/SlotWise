import { z } from "zod";
import { isValidTimeZone } from "@/features/availability/time";

/** Shared by the dashboard forms, the public booking form and their server actions. */

export const MAX_MEETING_TYPES = 20;
export const MAX_QUESTIONS = 3;
export const BUFFER_OPTIONS = [0, 5, 10, 15, 30] as const;
export const LOCATION_TYPES = ["video_link", "phone", "in_person"] as const;

export const LOCATION_LABELS: Record<(typeof LOCATION_TYPES)[number], string> = {
  video_link: "Video call",
  phone: "Phone call",
  in_person: "In person",
};

const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
}

const buffer = z.coerce
  .number()
  .refine(
    (n) => (BUFFER_OPTIONS as readonly number[]).includes(n),
    "Choose 0, 5, 10, 15 or 30 minutes",
  );

export const questionSchema = z.object({
  /** Present for questions that already exist, so past answers stay linked. */
  id: z.uuid().optional(),
  label: z
    .string()
    .trim()
    .min(1, "Write the question")
    .max(200, "Keep questions under 200 characters"),
  type: z.enum(["short_text", "long_text"]),
  required: z.boolean(),
});

export const meetingTypeSchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name").max(80, "Keep the name under 80 characters"),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Choose a link name")
      .max(50, "Keep the link under 50 characters")
      .regex(SLUG, "Use lowercase letters, numbers and hyphens"),
    durationMin: z.coerce
      .number()
      .int("Use whole minutes")
      .min(15, "Meetings must be at least 15 minutes")
      .max(240, "Meetings can be at most 4 hours"),
    description: z
      .string()
      .trim()
      .max(1000, "Keep the description under 1000 characters")
      .transform((v) => v || null),
    locationType: z.enum(LOCATION_TYPES),
    locationValue: z.string().trim().min(1, "Add where the meeting happens").max(500),
    bufferBeforeMin: buffer,
    bufferAfterMin: buffer,
    minNoticeMin: z.coerce
      .number()
      .int()
      .min(0, "Notice can't be negative")
      .max(30 * 24 * 60, "Notice can be at most 30 days"),
    maxDaysAhead: z.coerce
      .number()
      .int()
      .min(1, "Allow booking at least 1 day ahead")
      .max(365, "Allow booking at most 365 days ahead"),
    dailyLimit: z.coerce
      .number()
      .int()
      .min(1, "Allow at least 1 booking a day")
      .max(50, "At most 50 a day")
      .nullable(),
    isActive: z.boolean(),
    questions: z.array(questionSchema).max(MAX_QUESTIONS, `Ask at most ${MAX_QUESTIONS} questions`),
  })
  .superRefine((v, ctx) => {
    if (v.locationType === "video_link" && !/^https?:\/\/\S+$/i.test(v.locationValue)) {
      ctx.addIssue({
        code: "custom",
        message: "Paste the full meeting link, starting with https://",
        path: ["locationValue"],
      });
    }
  });

export type MeetingTypeInput = z.infer<typeof meetingTypeSchema>;

export const bookingRequestSchema = z.object({
  username: z.string().min(1),
  slug: z.string().min(1),
  startAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  inviteeName: z.string().trim().min(1, "Enter your name").max(120, "That name is too long"),
  inviteeEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email("Enter a valid email address")),
  inviteeTimezone: z.string().refine(isValidTimeZone, "Choose a valid time zone"),
  notes: z
    .string()
    .trim()
    .max(2000, "Keep notes under 2000 characters")
    .transform((v) => v || null),
  /** Question id → answer. Unknown ids are ignored; required ones are checked on the server. */
  answers: z.record(z.string(), z.string().trim().max(2000, "Keep answers under 2000 characters")),
});

export type BookingRequest = z.input<typeof bookingRequestSchema>;
