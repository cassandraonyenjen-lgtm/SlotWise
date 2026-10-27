"use server";

import { z } from "zod";
import { getDb } from "@/db";
import { requireUserId } from "@/lib/session";
import { toDetailView, type DetailView } from "./detail";
import { fromFloating } from "./floating";
import { getBookingDetail, getCalendarData, hostTimezone, type CalendarData } from "./queries";

const rangeSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/),
  timezone: z.string().min(1),
});

/** Called by FullCalendar with the visible range, as floating host-local times. */
export async function calendarDataAction(input: unknown): Promise<CalendarData | null> {
  const userId = await requireUserId();
  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) return null;
  const { start, end, timezone } = parsed.data;
  // Pad a day each side in case the host changed time zone since the page loaded.
  const from = new Date(fromFloating(start, timezone).getTime() - 86_400_000);
  const to = new Date(fromFloating(end, timezone).getTime() + 86_400_000);
  if (to.getTime() - from.getTime() > 100 * 86_400_000) return null;
  return getCalendarData(getDb(), userId, from, to);
}

export async function bookingDetailAction(bookingId: unknown): Promise<DetailView | null> {
  const userId = await requireUserId();
  const id = z.uuid().safeParse(bookingId);
  if (!id.success) return null;
  const db = getDb();
  const [detail, timezone] = await Promise.all([
    getBookingDetail(db, userId, id.data),
    hostTimezone(db, userId),
  ]);
  return detail ? toDetailView(detail, timezone) : null;
}
