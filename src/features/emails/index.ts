import { NotImplementedError } from "@/lib/not-implemented";

export type BookingEmailKind =
  "invitee_confirmation" | "host_notification" | "reminder" | "cancellation" | "reschedule";

export async function sendBookingEmail(kind: BookingEmailKind, bookingId: string): Promise<void> {
  void bookingId;
  throw new NotImplementedError(`sendBookingEmail(${kind}) (F4, Phase 3)`);
}
