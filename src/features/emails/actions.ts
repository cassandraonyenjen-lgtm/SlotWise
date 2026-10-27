"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { invalid, type ActionResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/session";
import { emailSettingsSchema } from "./schemas";
import { saveEmailSettings } from "./settings";

export async function saveEmailSettingsAction(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = emailSettingsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await saveEmailSettings(getDb(), userId, parsed.data);
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
