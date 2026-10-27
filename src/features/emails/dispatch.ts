import "server-only";
import { getDb } from "@/db";
import { env } from "@/env";
import { BOOKING_EVENTS, inngest, type BookingEventData } from "@/inngest/client";
import { sendBookingNotifications, type BookingChange } from "./send";
import { getTransport } from "./transport";

/**
 * Hands a booking change to the email pipeline. With Inngest configured, the event drives
 * notifications and reminders with retries. Without it (local dev, CI), notifications are
 * sent inline and reminders are skipped. Never throws: a booking must not fail because an
 * email did.
 */
export async function notifyBookingEvent(change: BookingChange, data: BookingEventData) {
  try {
    const e = env();
    if (e.INNGEST_EVENT_KEY || e.INNGEST_DEV) {
      await inngest.send({ name: BOOKING_EVENTS[change], data });
      return;
    }
    await sendBookingNotifications(getDb(), getTransport(), change, data.bookingId, {
      previousStartAt: data.previousStartAt ? new Date(data.previousStartAt) : undefined,
      previousEndAt: data.previousEndAt ? new Date(data.previousEndAt) : undefined,
    });
  } catch (error) {
    console.error(`[email] ${change} notification for booking ${data.bookingId} failed`, error);
  }
}
