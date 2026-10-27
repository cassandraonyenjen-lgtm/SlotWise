import { Inngest } from "inngest";

/** Background jobs (reminders, retries). Run `pnpm dlx inngest-cli@latest dev` locally. */
export const inngest = new Inngest({ id: "slotwise" });

export interface BookingEventData {
  bookingId: string;
  /** The booking's ics_sequence after the change. */
  sequence: number;
  previousStartAt?: string;
  previousEndAt?: string;
  /** A note from whoever made the change, shown in the email. */
  message?: string;
}

export const BOOKING_EVENTS = {
  created: "booking/created",
  rescheduled: "booking/rescheduled",
  cancelled: "booking/cancelled",
} as const;
