"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getDb } from "@/db";
import { notifyBookingEvent } from "@/features/emails/dispatch";
import { trackServer } from "@/lib/analytics";
import { invalid, type ActionResult } from "@/lib/action-result";
import { RATE_LIMITED_MESSAGE, rateLimit } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";
import {
  cancelBooking,
  findBookingByManageToken,
  getRescheduleSlots,
  markNoShow,
  rescheduleBooking,
  type Actor,
  type ChangeResult,
} from "./manage";
import {
  bookingIdSchema,
  cancelSchema,
  cutoffSchema,
  rescheduleSchema,
  slotWindowSchema,
} from "./schemas";
import { saveCancelCutoff } from "./settings";

export type ChangeActionResult = ActionResult | { ok: false; taken: true; error: string };

function afterChange(
  result: ChangeResult,
  change: "rescheduled" | "cancelled",
  by: "host" | "invitee",
  message?: string,
): ChangeActionResult {
  if (!result.ok) {
    return result.reason === "taken"
      ? { ok: false, taken: true, error: result.error }
      : { ok: false, error: result.error };
  }
  // Emails go out after the response, like confirmations do.
  after(() =>
    Promise.all([
      notifyBookingEvent(change, {
        bookingId: result.bookingId,
        sequence: result.sequence,
        previousStartAt: result.previousStartAt.toISOString(),
        previousEndAt: result.previousEndAt.toISOString(),
        ...(message ? { message } : {}),
      }),
      trackServer(
        result.hostId,
        change === "cancelled" ? "booking_cancelled" : "booking_rescheduled",
        {
          by,
        },
      ),
    ]),
  );
  // Only the host's pages show cached booking data. Revalidating from the invitee's page
  // would re-render it mid-flow and swap the confirmation for the "cancelled" view.
  if (by === "host") revalidatePath("/dashboard", "layout");
  return { ok: true };
}

async function bookingIdForToken(token: string) {
  // Every token-based call counts, so guessing tokens is throttled too (F5.5).
  if (!(await rateLimit("manage")).ok) return null;
  const found = await findBookingByManageToken(getDb(), token);
  return found?.booking.id ?? null;
}

const LINK_INVALID = {
  ok: false,
  error: `This link isn't valid any more, or there were too many attempts. ${RATE_LIMITED_MESSAGE}`,
} as const;

// Invitee actions: the manage token is the only credential (F5.1, F5.2, F5.5).

export async function manageSlotsAction(token: string, input: unknown): Promise<string[] | null> {
  const parsed = slotWindowSchema.safeParse(input);
  const bookingId = parsed.success ? await bookingIdForToken(token) : null;
  if (!parsed.success || !bookingId) return null;
  const slots = await getRescheduleSlots(getDb(), {
    bookingId,
    actor: { kind: "invitee" },
    ...parsed.data,
  });
  return slots?.map((s) => s.toISOString()) ?? null;
}

export async function manageRescheduleAction(
  token: string,
  input: unknown,
): Promise<ChangeActionResult> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const bookingId = await bookingIdForToken(token);
  if (!bookingId) return LINK_INVALID;
  const result = await rescheduleBooking(getDb(), {
    bookingId,
    actor: { kind: "invitee" },
    startAt: parsed.data.startAt,
  });
  return afterChange(result, "rescheduled", "invitee");
}

export async function manageCancelAction(
  token: string,
  input: unknown,
): Promise<ChangeActionResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const bookingId = await bookingIdForToken(token);
  if (!bookingId) return LINK_INVALID;
  const result = await cancelBooking(getDb(), {
    bookingId,
    actor: { kind: "invitee" },
    reason: parsed.data.reason,
  });
  return afterChange(result, "cancelled", "invitee");
}

// Host actions from the dashboard (F5.3, F3.5).

async function hostActor(bookingId: unknown): Promise<{ id: string; actor: Actor } | null> {
  const userId = await requireUserId();
  const parsed = bookingIdSchema.safeParse(bookingId);
  return parsed.success ? { id: parsed.data, actor: { kind: "host", userId } } : null;
}

export async function hostSlotsAction(bookingId: string, input: unknown): Promise<string[] | null> {
  const host = await hostActor(bookingId);
  const parsed = slotWindowSchema.safeParse(input);
  if (!host || !parsed.success) return null;
  const slots = await getRescheduleSlots(getDb(), {
    bookingId: host.id,
    actor: host.actor,
    ...parsed.data,
  });
  return slots?.map((s) => s.toISOString()) ?? null;
}

export async function hostRescheduleAction(
  bookingId: string,
  input: unknown,
): Promise<ChangeActionResult> {
  const host = await hostActor(bookingId);
  if (!host) return { ok: false, error: "This booking wasn't found." };
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await rescheduleBooking(getDb(), {
    bookingId: host.id,
    actor: host.actor,
    startAt: parsed.data.startAt,
    message: parsed.data.message,
  });
  return afterChange(result, "rescheduled", "host", parsed.data.message);
}

export async function hostCancelAction(
  bookingId: string,
  input: unknown,
): Promise<ChangeActionResult> {
  const host = await hostActor(bookingId);
  if (!host) return { ok: false, error: "This booking wasn't found." };
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const result = await cancelBooking(getDb(), {
    bookingId: host.id,
    actor: host.actor,
    reason: parsed.data.reason,
  });
  return afterChange(result, "cancelled", "host");
}

export async function markNoShowAction(bookingId: string): Promise<ActionResult> {
  const host = await hostActor(bookingId);
  if (!host || host.actor.kind !== "host")
    return { ok: false, error: "This booking wasn't found." };
  const userId = host.actor.userId;
  const result = await markNoShow(getDb(), { bookingId: host.id, userId });
  if (!result.ok) return result;
  after(() => trackServer(userId, "booking_no_show"));
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function saveCutoffAction(input: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  const parsed = cutoffSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  await saveCancelCutoff(getDb(), userId, parsed.data.cancelCutoffMin);
  revalidatePath("/dashboard/settings");
  return { ok: true };
}
