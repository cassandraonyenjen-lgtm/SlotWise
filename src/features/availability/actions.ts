"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { removeDateOverride, saveDateOverride, saveWeeklyHours, setTimezone } from "./queries";
import { dateOverrideSchema, timeZoneSchema, weeklyHoursSchema } from "./schemas";
import { isLocalDate } from "./time";

export type ActionResult = { ok: true } | { ok: false; error: string; fieldErrors?: FieldErrors };
/** Issue messages keyed by their dotted path, e.g. "days.1.0.start". */
export type FieldErrors = Record<string, string>;

const PAGE = "/dashboard/availability";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

function invalid(error: z.ZodError): ActionResult {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
  return {
    ok: false,
    error: error.issues[0]?.message ?? "Check the highlighted fields",
    fieldErrors,
  };
}

export async function saveWeeklyHoursAction(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = weeklyHoursSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await saveWeeklyHours(getDb(), userId, parsed.data);
  revalidatePath(PAGE);
  return { ok: true };
}

export async function setTimezoneAction(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = timeZoneSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await setTimezone(getDb(), userId, parsed.data);
  revalidatePath(PAGE);
  return { ok: true };
}

export async function saveDateOverrideAction(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = dateOverrideSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await saveDateOverride(getDb(), userId, parsed.data);
  revalidatePath(PAGE);
  return { ok: true };
}

export async function removeDateOverrideAction(date: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  if (typeof date !== "string" || !isLocalDate(date)) return { ok: false, error: "Invalid date" };
  await removeDateOverride(getDb(), userId, date);
  revalidatePath(PAGE);
  return { ok: true };
}
