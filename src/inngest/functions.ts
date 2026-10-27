import { getDb } from "@/db";
import {
  reminderSchedule,
  sendBookingNotifications,
  sendReminder,
  type BookingChange,
} from "@/features/emails/send";
import { loadBookingContext } from "@/features/emails/context";
import { getTransport } from "@/features/emails/transport";
import { BOOKING_EVENTS, inngest, type BookingEventData } from "./client";

const CHANGE_BY_EVENT: Record<string, BookingChange> = {
  [BOOKING_EVENTS.created]: "created",
  [BOOKING_EVENTS.rescheduled]: "rescheduled",
  [BOOKING_EVENTS.cancelled]: "cancelled",
};

/** Confirmation, reschedule and cancellation emails, retried by Inngest on failure. */
export const bookingNotifications = inngest.createFunction(
  {
    id: "booking-notifications",
    triggers: [
      { event: BOOKING_EVENTS.created },
      { event: BOOKING_EVENTS.rescheduled },
      { event: BOOKING_EVENTS.cancelled },
    ],
  },
  async ({ event, step }) => {
    const data = event.data as BookingEventData;
    const change = CHANGE_BY_EVENT[event.name];
    if (!change) return { skipped: true };
    return step.run("send", () =>
      sendBookingNotifications(getDb(), getTransport(), change, data.bookingId, {
        previousStartAt: data.previousStartAt ? new Date(data.previousStartAt) : undefined,
        previousEndAt: data.previousEndAt ? new Date(data.previousEndAt) : undefined,
        message: data.message,
      }),
    );
  },
);

/**
 * Reminders (F4.3). A reschedule starts a fresh run; the old run's reminders see the
 * sequence has moved on and skip themselves. A cancellation stops the run outright.
 */
export const bookingReminders = inngest.createFunction(
  {
    id: "booking-reminders",
    triggers: [{ event: BOOKING_EVENTS.created }, { event: BOOKING_EVENTS.rescheduled }],
    cancelOn: [{ event: BOOKING_EVENTS.cancelled, match: "data.bookingId" }],
  },
  async ({ event, step }) => {
    const data = event.data as BookingEventData;
    const plan = await step.run("plan", async () => {
      const ctx = await loadBookingContext(getDb(), data.bookingId);
      if (!ctx) return [];
      return reminderSchedule(ctx.host.reminderPolicy, ctx.booking.startAt).map((r) => ({
        offset: r.offset,
        sendAt: r.sendAt.toISOString(),
      }));
    });

    const results = [];
    for (const { offset, sendAt } of plan) {
      await step.sleepUntil(`wait-${offset}`, sendAt);
      results.push(
        await step.run(`send-${offset}`, () =>
          sendReminder(getDb(), getTransport(), {
            bookingId: data.bookingId,
            sequence: data.sequence,
            offset,
          }),
        ),
      );
    }
    return results;
  },
);

export const functions = [bookingNotifications, bookingReminders];
