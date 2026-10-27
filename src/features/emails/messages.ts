import { render } from "@react-email/render";
import { buildIcs, type CalendarEvent } from "@/features/booking-page/calendar-links";
import { LOCATION_LABELS } from "@/features/booking-page/schemas";
import { manageTokenFor } from "@/lib/tokens";
import type { BookingContext } from "./context";
import { formatMeetingTime, formatShortDate } from "./format";
import { BookingEmail, type BookingEmailProps } from "./templates/booking-email";

export type EmailKind =
  "invitee_confirmation" | "host_notification" | "reminder" | "cancellation" | "reschedule";

export type Recipient = "invitee" | "host";

export interface MessageOptions {
  appUrl: string;
  /** Reminders: how far ahead this one is. */
  reminderOffset?: "1h" | "24h";
  /** Reschedules: where the meeting used to be. */
  previousStartAt?: Date;
  previousEndAt?: Date;
}

export interface BuiltMessage {
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  ics?: { filename: string; content: string; method: "REQUEST" | "CANCEL" };
}

/**
 * Builds one email for one recipient. Times are always in that recipient's zone: the
 * invitee's from the booking, the host's from their profile (F4.1, F4.2, F4.4).
 */
export async function buildMessage(
  kind: EmailKind,
  recipient: Recipient,
  ctx: BookingContext,
  options: MessageOptions,
): Promise<BuiltMessage> {
  const { booking, host, meetingType, answers } = ctx;
  const hostName = host.name?.trim() || host.username || "Your host";
  const inviteeName = booking.inviteeName;
  const tz = recipient === "invitee" ? booking.inviteeTimezone : host.timezone;
  const when = formatMeetingTime(booking.startAt, booking.endAt, tz);
  const shortDate = formatShortDate(booking.startAt, tz);
  const locationLabel = LOCATION_LABELS[meetingType.locationType];
  const where: [string, string] = [locationLabel, meetingType.locationValue ?? ""];
  const manageUrl = `${options.appUrl}/manage/${manageTokenFor(booking.id)}`;
  const manageButtons = [
    { label: "Reschedule", href: `${manageUrl}?action=reschedule` },
    { label: "Cancel", href: `${manageUrl}?action=cancel` },
  ];
  const dashboardButton = [{ label: "Open your dashboard", href: `${options.appUrl}/dashboard` }];
  const inviteeRows: [string, string][] = [
    ["Invitee", `${inviteeName} <${booking.inviteeEmail}>`],
    ...answers.map((a): [string, string] => [a.label, a.answer]),
    ...(booking.notes ? [["Notes", booking.notes] as [string, string]] : []),
  ];
  const withName = recipient === "invitee" ? `with ${hostName}` : `with ${inviteeName}`;

  let props: Omit<BookingEmailProps, "hostName" | "logoUrl">;
  let subject: string;
  let icsMethod: "REQUEST" | "CANCEL" | null = null;

  switch (kind) {
    case "invitee_confirmation":
      subject = `Confirmed: ${meetingType.name} with ${hostName} on ${shortDate}`;
      icsMethod = "REQUEST";
      props = {
        preview: `${meetingType.name} on ${when}`,
        heading: "You're booked",
        intro: `Your ${meetingType.name} with ${hostName} is confirmed. A calendar invite is attached.`,
        rows: [["When", when], where, ["With", hostName]],
        buttons: manageButtons,
        footer: `Need to make a change? Use the buttons above. Sent by Slotwise on behalf of ${hostName}.`,
      };
      break;
    case "host_notification":
      subject = `New booking: ${inviteeName}, ${meetingType.name} on ${shortDate}`;
      icsMethod = "REQUEST";
      props = {
        preview: `${inviteeName} booked ${meetingType.name}`,
        heading: "New booking",
        intro: `${inviteeName} booked a ${meetingType.name}.`,
        rows: [["When", when], where, ...inviteeRows],
        buttons: dashboardButton,
        footer: "You're getting this because someone booked time with you on Slotwise.",
      };
      break;
    case "reminder": {
      const soon = options.reminderOffset === "1h" ? "in 1 hour" : "tomorrow";
      subject = `Reminder: ${meetingType.name} with ${hostName} ${soon}`;
      props = {
        preview: `${meetingType.name} ${soon}`,
        heading: `Your meeting is ${soon}`,
        intro: `This is a reminder of your ${meetingType.name} with ${hostName}.`,
        rows: [["When", when], where],
        buttons: manageButtons,
      };
      break;
    }
    case "cancellation":
      subject = `Cancelled: ${meetingType.name} ${withName} on ${shortDate}`;
      icsMethod = "CANCEL";
      props = {
        preview: `${meetingType.name} on ${shortDate} was cancelled`,
        heading: "Meeting cancelled",
        intro:
          recipient === "invitee"
            ? `Your ${meetingType.name} with ${hostName} has been cancelled.`
            : `Your ${meetingType.name} with ${inviteeName} has been cancelled.`,
        rows: [
          ["Was", when],
          ...(booking.cancelReason ? [["Reason", booking.cancelReason] as [string, string]] : []),
        ],
        buttons:
          recipient === "invitee" && host.username
            ? [{ label: "Book another time", href: `${options.appUrl}/${host.username}` }]
            : dashboardButton,
      };
      break;
    case "reschedule": {
      const previous =
        options.previousStartAt && options.previousEndAt
          ? formatMeetingTime(options.previousStartAt, options.previousEndAt, tz)
          : null;
      subject = `Rescheduled: ${meetingType.name} ${withName}, now ${shortDate}`;
      icsMethod = "REQUEST";
      props = {
        preview: `${meetingType.name} moved to ${when}`,
        heading: "Meeting rescheduled",
        intro: `Your ${meetingType.name} ${withName} has moved. Your calendar invite is updated.`,
        rows: [
          ["New time", when],
          ...(previous ? [["Previously", previous] as [string, string]] : []),
          where,
        ],
        buttons: recipient === "invitee" ? manageButtons : dashboardButton,
      };
      break;
    }
  }

  const element = BookingEmail({ ...props, hostName, logoUrl: host.logoUrl });
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  let ics: BuiltMessage["ics"];
  if (icsMethod) {
    const event: CalendarEvent = {
      uid: booking.icsUid,
      sequence: booking.icsSequence,
      title: `${meetingType.name} ${withName}`,
      description: `${locationLabel}: ${meetingType.locationValue ?? ""}`,
      location: meetingType.locationValue ?? "",
      startAt: booking.startAt,
      endAt: booking.endAt,
      organizer: { name: hostName, email: host.email },
    };
    ics = {
      filename: icsMethod === "CANCEL" ? "cancelled.ics" : "invite.ics",
      method: icsMethod,
      content: buildIcs(event, {
        method: icsMethod,
        attendee: { name: inviteeName, email: booking.inviteeEmail },
      }),
    };
  }

  return {
    to: recipient === "invitee" ? booking.inviteeEmail : host.email,
    // Replies go to the other person, not to a no-reply inbox.
    replyTo: recipient === "invitee" ? host.email : booking.inviteeEmail,
    subject,
    html,
    text,
    ics,
  };
}
