"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { trackServer } from "@/lib/analytics";
import { getDb } from "@/db";
import { invalid, type ActionResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/session";
import { removeDateOverride, saveDateOverride, saveWeeklyHours, setTimezone } from "./queries";
import { dateOverrideSchema, timeZoneSchema, weeklyHoursSchema } from "./schemas";
import { isLocalDate } from "./time";

export type { ActionResult, FieldErrors } from "@/lib/action-result";

const PAGE = "/dashboard/availability";

export async function saveWeeklyHoursAction(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = weeklyHoursSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await saveWeeklyHours(getDb(), userId, parsed.data);
  after(() => trackServer(userId, "availability_saved"));
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
