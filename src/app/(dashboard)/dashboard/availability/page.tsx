import type { Metadata } from "next";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { DateOverrides } from "@/features/availability/components/date-overrides";
import { TimezonePicker } from "@/features/availability/components/timezone-picker";
import { WeeklyHoursEditor } from "@/features/availability/components/weekly-hours-editor";
import { findBookingsOnBlockedDates, getAvailability } from "@/features/availability/queries";
import { localDateOf } from "@/features/availability/time";

export const metadata: Metadata = { title: "Availability" };

export default async function AvailabilityPage() {
  const session = await auth();
  const userId = session!.user.id; // The dashboard layout already redirects signed-out visitors.
  const db = getDb();
  const now = new Date();
  const [availability, flagged] = await Promise.all([
    getAvailability(db, userId, now),
    findBookingsOnBlockedDates(db, userId, now),
  ]);
  const today = localDateOf(now, availability.timezone);
  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: availability.timezone,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Availability</h1>
        <p className="text-muted-foreground text-sm">
          Changes show on your booking page straight away.
        </p>
      </div>

      {flagged.length > 0 && (
        <div role="alert" className="border-destructive/40 bg-destructive/5 rounded-lg border p-4">
          <p className="font-medium">
            {flagged.length === 1
              ? "1 booking is on a date you've blocked."
              : `${flagged.length} bookings are on dates you've blocked.`}
          </p>
          <p className="text-muted-foreground text-sm">
            They haven&apos;t been cancelled. Reschedule or cancel them if you won&apos;t be
            available.
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {flagged.map((b) => (
              <li key={b.id}>
                {timeFmt.format(b.startAt)} with {b.inviteeName}
              </li>
            ))}
          </ul>
        </div>
      )}

      <TimezonePicker current={availability.timezone} />
      <WeeklyHoursEditor initial={availability.weekly} />
      <DateOverrides overrides={availability.overrides} today={today} />
    </div>
  );
}
