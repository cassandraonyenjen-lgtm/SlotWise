import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db";
import { emailLog } from "@/db/schema";
import { env } from "@/env";
import { loadBookingContext, type BookingContext } from "./context";
import { fromWithName } from "./format";
import { buildMessage, type BuiltMessage, type EmailKind, type Recipient } from "./messages";
import type { EmailTransport } from "./transport";

export type BookingChange = "created" | "rescheduled" | "cancelled";
export type ReminderOffset = "1h" | "24h";

const OFFSET_MS: Record<ReminderOffset, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "1h": 60 * 60 * 1000,
};

export interface DeliverInput {
  bookingId: string;
  type: EmailKind;
  idempotencyKey: string;
  from: string;
  message: BuiltMessage;
}

export type DeliverOutcome = "sent" | "skipped";

/**
 * Sends one email at most once per idempotency key (F4.3). The email_log row is claimed
 * first; a key that already sent is skipped, and a failed send can be retried.
 */
export async function deliver(
  db: Database,
  transport: EmailTransport,
  input: DeliverInput,
): Promise<DeliverOutcome> {
  const { message } = input;
  await db
    .insert(emailLog)
    .values({
      bookingId: input.bookingId,
      type: input.type,
      recipient: message.to,
      idempotencyKey: input.idempotencyKey,
    })
    .onConflictDoNothing({ target: emailLog.idempotencyKey });

  // Only a queued or failed row moves on to sending; one that already went out is skipped.
  // Two attempts racing on the same key are also deduped by the provider's idempotency key.
  const [claimed] = await db
    .update(emailLog)
    .set({ status: "queued" })
    .where(
      and(
        eq(emailLog.idempotencyKey, input.idempotencyKey),
        inArray(emailLog.status, ["queued", "failed"]),
      ),
    )
    .returning({ id: emailLog.id });
  if (!claimed) return "skipped";

  try {
    const { id } = await transport.send({
      from: input.from,
      to: message.to,
      replyTo: message.replyTo,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.ics
        ? [
            {
              filename: message.ics.filename,
              content: message.ics.content,
              contentType: `text/calendar; charset=utf-8; method=${message.ics.method}`,
            },
          ]
        : undefined,
      idempotencyKey: input.idempotencyKey,
    });
    await db
      .update(emailLog)
      .set({ status: "sent", providerId: id, sentAt: new Date() })
      .where(eq(emailLog.id, claimed.id));
    return "sent";
  } catch (error) {
    await db.update(emailLog).set({ status: "failed" }).where(eq(emailLog.id, claimed.id));
    throw error;
  }
}

const NOTIFICATIONS: Record<BookingChange, [EmailKind, Recipient][]> = {
  created: [
    ["invitee_confirmation", "invitee"],
    ["host_notification", "host"],
  ],
  rescheduled: [
    ["reschedule", "invitee"],
    ["reschedule", "host"],
  ],
  cancelled: [
    ["cancellation", "invitee"],
    ["cancellation", "host"],
  ],
};

export interface NotifyOptions {
  appUrl?: string;
  previousStartAt?: Date;
  previousEndAt?: Date;
  message?: string;
}

function senderFor(ctx: BookingContext) {
  return fromWithName(env().EMAIL_FROM, ctx.host.name?.trim() || ctx.host.username || "Slotwise");
}

/** Confirmation, reschedule or cancellation emails to both invitee and host (F4.1, F4.2, F4.4). */
export async function sendBookingNotifications(
  db: Database,
  transport: EmailTransport,
  change: BookingChange,
  bookingId: string,
  options: NotifyOptions = {},
): Promise<DeliverOutcome[]> {
  const ctx = await loadBookingContext(db, bookingId);
  if (!ctx) return [];
  const appUrl = options.appUrl ?? env().NEXT_PUBLIC_APP_URL;
  const from = senderFor(ctx);
  const outcomes: DeliverOutcome[] = [];
  for (const [type, recipient] of NOTIFICATIONS[change]) {
    const message = await buildMessage(type, recipient, ctx, {
      appUrl,
      previousStartAt: options.previousStartAt,
      previousEndAt: options.previousEndAt,
      message: options.message,
    });
    outcomes.push(
      await deliver(db, transport, {
        bookingId,
        type,
        from,
        message,
        idempotencyKey: `${type}:${bookingId}:${ctx.booking.icsSequence}:${recipient}`,
      }),
    );
  }
  return outcomes;
}

/**
 * When each reminder for a booking should go out under the host's policy (F4.3). Reminders
 * whose time has already passed are dropped, so a booking made 3 hours ahead gets only
 * the 1-hour one.
 */
export function reminderSchedule(
  policy: "off" | "1h" | "24h" | "both",
  startAt: Date,
  now: Date = new Date(),
): { offset: ReminderOffset; sendAt: Date }[] {
  const offsets: ReminderOffset[] =
    policy === "both" ? ["24h", "1h"] : policy === "off" ? [] : [policy];
  return offsets
    .map((offset) => ({ offset, sendAt: new Date(startAt.getTime() - OFFSET_MS[offset]) }))
    .filter(({ sendAt }) => sendAt.getTime() > now.getTime());
}

export interface ReminderInput {
  bookingId: string;
  /** The booking's ics_sequence when the reminder was scheduled. */
  sequence: number;
  offset: ReminderOffset;
  appUrl?: string;
  now?: Date;
}

export type ReminderOutcome = DeliverOutcome | "stale";

/**
 * Sends one reminder to the invitee, unless the booking changed since it was scheduled:
 * cancelled, rescheduled (sequence moved on) or already started.
 */
export async function sendReminder(
  db: Database,
  transport: EmailTransport,
  input: ReminderInput,
): Promise<ReminderOutcome> {
  const ctx = await loadBookingContext(db, input.bookingId);
  const now = input.now ?? new Date();
  if (
    !ctx ||
    ctx.booking.status !== "confirmed" ||
    ctx.booking.icsSequence !== input.sequence ||
    ctx.booking.startAt.getTime() <= now.getTime()
  ) {
    return "stale";
  }
  const message = await buildMessage("reminder", "invitee", ctx, {
    appUrl: input.appUrl ?? env().NEXT_PUBLIC_APP_URL,
    reminderOffset: input.offset,
  });
  return deliver(db, transport, {
    bookingId: input.bookingId,
    type: "reminder",
    from: senderFor(ctx),
    message,
    idempotencyKey: `reminder:${input.bookingId}:${input.sequence}:${input.offset}`,
  });
}
