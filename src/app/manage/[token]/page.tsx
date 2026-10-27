import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { ManageBooking } from "@/features/booking-management/components/manage-booking";
import { findBookingByManageToken } from "@/features/booking-management/manage";
import { LOCATION_LABELS } from "@/features/booking-page/schemas";
import { formatMeetingTime } from "@/features/emails/format";

export const dynamic = "force-dynamic";

// Tokenized links must never be indexed or leak via referrer.
export const metadata: Metadata = {
  title: "Manage booking",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string }>;
};

/** Where an invitee lands from "Reschedule" or "Cancel" in their emails (F5.1, F5.2, F5.4). */
export default async function ManageBookingPage({ params, searchParams }: Props) {
  const [{ token }, { action }] = await Promise.all([params, searchParams]);
  const found = await findBookingByManageToken(getDb(), token);

  if (!found) {
    return (
      <Shell title="This link isn't valid">
        <p className="text-sm">
          Check that you opened the whole link from your email. If it still doesn&apos;t work, reply
          to your confirmation email to reach your host.
        </p>
      </Shell>
    );
  }

  const { booking, host, meetingType, state } = found;
  const hostName = host.name?.trim() || host.username || "your host";
  const bookAgainHref = host.username ? `/${host.username}` : null;
  const summary = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">What</dt>
      <dd>
        {meetingType.name} with {hostName}
      </dd>
      <dt className="text-muted-foreground">When</dt>
      <dd className={state === "cancelled" ? "line-through" : undefined}>
        {formatMeetingTime(booking.startAt, booking.endAt, booking.inviteeTimezone)}
      </dd>
      <dt className="text-muted-foreground">{LOCATION_LABELS[meetingType.locationType]}</dt>
      <dd className="break-words">{meetingType.locationValue}</dd>
    </dl>
  );

  return (
    <Shell title="Your booking">
      {summary}
      <div className="border-t pt-4">
        {state === "active" ? (
          <ManageBooking
            token={token}
            startAt={booking.startAt.toISOString()}
            inviteeTimezone={booking.inviteeTimezone}
            durationMin={meetingType.durationMin}
            maxDaysAhead={meetingType.maxDaysAhead}
            hostName={hostName}
            bookAgainHref={bookAgainHref}
            initialAction={action === "reschedule" || action === "cancel" ? action : null}
          />
        ) : state === "cancelled" ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>This meeting has been cancelled.</p>
            {bookAgainHref && (
              <a className="text-primary underline" href={bookAgainHref}>
                Book another time with {hostName}
              </a>
            )}
          </div>
        ) : state === "within_cutoff" ? (
          <p className="text-sm">
            It&apos;s too close to the meeting to change it online. Please contact {hostName}{" "}
            directly at{" "}
            <a className="text-primary underline" href={`mailto:${host.email}`}>
              {host.email}
            </a>
            .
          </p>
        ) : (
          <p className="text-sm">This meeting has already started, so it can&apos;t be changed.</p>
        )}
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl font-semibold">{title}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </main>
  );
}
