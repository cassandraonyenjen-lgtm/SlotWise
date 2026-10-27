"use server";

import { after } from "next/server";
import { getDb } from "@/db";
import { notifyBookingEvent } from "@/features/emails/dispatch";
import { invalid, type ActionResult } from "@/lib/action-result";
import { buildIcs, type CalendarEvent } from "./calendar-links";
import { createBooking } from "./public";
import { bookingRequestSchema, LOCATION_LABELS } from "./schemas";

export interface BookingConfirmation {
  startAt: string;
  endAt: string;
  meetingTypeName: string;
  hostName: string;
  locationLabel: string;
  locationValue: string;
  calendar: Omit<CalendarEvent, "startAt" | "endAt"> & { startAt: string; endAt: string };
  ics: string;
}

export type BookResult =
  ActionResult<BookingConfirmation> | { ok: false; taken: true; error: string };

/** Public: no sign-in. Invitees book with just a name and email (F2.4). */
export async function bookSlotAction(input: unknown): Promise<BookResult> {
  const parsed = bookingRequestSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const result = await createBooking(getDb(), parsed.data);
  if (!result.ok) {
    switch (result.reason) {
      case "taken":
        return {
          ok: false,
          taken: true,
          error: "This time was just taken. Please pick another time.",
        };
      case "not_found":
        return { ok: false, error: "This meeting type is no longer available." };
      case "invalid":
        return {
          ok: false,
          error: result.error,
          ...(result.field ? { fieldErrors: { [result.field]: result.error } } : {}),
        };
    }
  }

  const { booking, host, meetingType } = result;
  const hostName = host.name ?? "your host";
  const locationLabel =
    LOCATION_LABELS[meetingType.locationType as keyof typeof LOCATION_LABELS] ?? "Location";
  const event: CalendarEvent = {
    uid: booking.icsUid,
    sequence: booking.icsSequence,
    title: `${meetingType.name} with ${hostName}`,
    description: `${locationLabel}: ${meetingType.locationValue ?? ""}\n\nBooked with Slotwise.`,
    location: meetingType.locationValue ?? "",
    startAt: booking.startAt,
    endAt: booking.endAt,
    organizer: { name: hostName, email: host.email },
  };

  // Emails go out after the response, so the invitee sees the confirmation right away.
  after(() =>
    notifyBookingEvent("created", { bookingId: booking.id, sequence: booking.icsSequence }),
  );
  return {
    ok: true,
    data: {
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      meetingTypeName: meetingType.name,
      hostName,
      locationLabel,
      locationValue: meetingType.locationValue ?? "",
      calendar: {
        ...event,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt.toISOString(),
      },
      ics: buildIcs(event),
    },
  };
}
