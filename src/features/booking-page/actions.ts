"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { trackServer } from "@/lib/analytics";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { invalid, type ActionResult } from "@/lib/action-result";
import { requireUserId } from "@/lib/session";
import { usernameSchema } from "@/lib/usernames";
import {
  createMeetingType,
  deleteMeetingType,
  setUsername,
  updateMeetingType,
  type SaveResult,
} from "./meeting-types";
import { meetingTypeSchema } from "./schemas";

const LIST = "/dashboard/meeting-types";

function fromSave(result: SaveResult): ActionResult {
  if (result.ok) return { ok: true };
  return {
    ok: false,
    error: result.error,
    ...(result.field ? { fieldErrors: { [result.field]: result.error } } : {}),
  };
}

export async function createMeetingTypeAction(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = meetingTypeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await createMeetingType(getDb(), userId, parsed.data);
  if (!result.ok) return fromSave(result);
  after(() =>
    trackServer(userId, "meeting_type_created", {
      durationMin: parsed.data.durationMin,
      questions: parsed.data.questions.length,
    }),
  );
  revalidatePath(LIST);
  redirect(LIST);
}

export async function updateMeetingTypeAction(id: string, input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = meetingTypeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await updateMeetingType(getDb(), userId, id, parsed.data);
  if (!result.ok) return fromSave(result);
  revalidatePath(LIST);
  redirect(LIST);
}

export async function deleteMeetingTypeAction(id: string): Promise<ActionResult> {
  const userId = await requireUserId();
  const result = await deleteMeetingType(getDb(), userId, id);
  if (!result.ok) return result;
  revalidatePath(LIST);
  redirect(LIST);
}

export async function setUsernameAction(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = usernameSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await setUsername(getDb(), userId, parsed.data);
  if (!result.ok)
    return { ok: false, error: result.error, fieldErrors: { username: result.error } };
  after(() => trackServer(userId, "username_set"));
  revalidatePath(LIST);
  return { ok: true };
}
