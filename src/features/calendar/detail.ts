import { LOCATION_LABELS } from "@/features/booking-page/schemas";
import { formatMeetingTime } from "@/features/emails/format";
import type { BookingDetail } from "./queries";

const ACTOR = { host: "you", invitee: "the invitee", system: "Slotwise" } as const;

/** The details panel's view of a booking: plain, serializable, times in the host's zone. */
export function toDetailView(detail: BookingDetail, hostTimezone: string, now = new Date()) {
  const at = new Intl.DateTimeFormat("en-US", {
    timeZone: hostTimezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  const started = detail.startAt.getTime() <= now.getTime();
  return {
    id: detail.id,
    status: detail.status,
    inviteeName: detail.inviteeName,
    inviteeEmail: detail.inviteeEmail,
    inviteeTimezone: detail.inviteeTimezone,
    meetingTypeName: detail.meetingType.name,
    maxDaysAhead: detail.meetingType.maxDaysAhead,
    when: formatMeetingTime(detail.startAt, detail.endAt, hostTimezone),
    inviteeWhen:
      detail.inviteeTimezone === hostTimezone
        ? null
        : formatMeetingTime(detail.startAt, detail.endAt, detail.inviteeTimezone),
    location: {
      label: LOCATION_LABELS[detail.meetingType.locationType],
      value: detail.meetingType.locationValue ?? "",
    },
    notes: detail.notes,
    answers: detail.answers,
    cancelReason: detail.cancelReason,
    canChange: detail.status === "confirmed" && !started,
    canMarkNoShow: detail.status === "confirmed" && started,
    history: detail.events.map((e) => ({
      id: e.id,
      at: at.format(e.createdAt),
      text: describeEvent(e, at),
    })),
  };
}

export type DetailView = ReturnType<typeof toDetailView>;

function describeEvent(e: BookingDetail["events"][number], at: Intl.DateTimeFormat): string {
  const by = ACTOR[e.actor];
  const data = (e.data ?? {}) as { fromStartAt?: string; toStartAt?: string; reason?: string };
  switch (e.type) {
    case "created":
      return `Booked by ${by}`;
    case "rescheduled":
      return data.fromStartAt && data.toStartAt
        ? `Moved by ${by} from ${at.format(new Date(data.fromStartAt))} to ${at.format(new Date(data.toStartAt))}`
        : `Rescheduled by ${by}`;
    case "cancelled":
      return `Cancelled by ${by}${data.reason ? `: “${data.reason}”` : ""}`;
    case "marked_no_show":
      return "Marked as a no-show";
  }
}
