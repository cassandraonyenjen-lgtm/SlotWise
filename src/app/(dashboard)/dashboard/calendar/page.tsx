import type { Metadata } from "next";
import { requireUserId } from "@/auth";
import { getDb } from "@/db";
import { CalendarView } from "@/features/calendar/components/calendar-view";
import { toFloating } from "@/features/calendar/floating";
import { getBookingDetail, getBusinessHours, hostTimezone } from "@/features/calendar/queries";

export const metadata: Metadata = { title: "Calendar" };

type Props = { searchParams: Promise<{ booking?: string }> };

export default async function CalendarPage({ searchParams }: Props) {
  const userId = await requireUserId();

  const { booking: bookingParam } = await searchParams;
  const db = getDb();
  const [timezone, businessHours] = await Promise.all([
    hostTimezone(db, userId),
    getBusinessHours(db, userId),
  ]);
  const bookingId =
    bookingParam && /^[0-9a-f-]{36}$/i.test(bookingParam) ? bookingParam : undefined;
  const linked = bookingId ? await getBookingDetail(db, userId, bookingId) : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Calendar</h1>
      <CalendarView
        timezone={timezone}
        businessHours={businessHours}
        now={toFloating(new Date(), timezone)}
        initialDate={linked ? toFloating(linked.startAt, timezone).slice(0, 10) : undefined}
        initialBookingId={linked?.id}
      />
    </div>
  );
}
