import type { Metadata } from "next";
import Link from "next/link";
import { requireUserId } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { getTodaySummary } from "@/features/calendar/queries";

export const metadata: Metadata = { title: "Today" };

type Item = Awaited<ReturnType<typeof getTodaySummary>>["today"][number];

/** Dashboard home: today's meetings and what's next (F3 "Today" summary). */
export default async function TodayPage() {
  const userId = await requireUserId();
  const { timezone, today, next } = await getTodaySummary(getDb(), userId);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const todayLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const row = (b: Item, withDay: boolean) => (
    <li key={b.id}>
      <Link
        href={`/dashboard/calendar?booking=${b.id}`}
        className="hover:bg-muted flex flex-wrap items-baseline gap-x-3 rounded-md px-2 py-2"
      >
        <span className="w-28 shrink-0 text-sm font-medium tabular-nums">
          {withDay && `${day.format(b.startAt)}, `}
          {time.format(b.startAt)}
        </span>
        <span className="text-sm">
          {b.inviteeName} · <span className="text-muted-foreground">{b.meetingType}</span>
          {b.status === "no_show" && <span className="text-muted-foreground"> (no-show)</span>}
        </span>
      </Link>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="text-muted-foreground text-sm">
            {todayLabel} · {timezone.replaceAll("_", " ")}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/calendar">Open calendar</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>
              {today.length === 0
                ? "No meetings today"
                : `${today.length} meeting${today.length === 1 ? "" : "s"} today`}
            </h2>
          </CardTitle>
        </CardHeader>
        {today.length > 0 && (
          <CardContent>
            <ul className="-mx-2 flex flex-col">{today.map((b) => row(b, false))}</ul>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Coming up</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {next.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing booked yet. Share your booking link from{" "}
              <Link className="text-primary underline" href="/dashboard/meeting-types">
                Meeting types
              </Link>{" "}
              to get started.
            </p>
          ) : (
            <ul className="-mx-2 flex flex-col">{next.map((b) => row(b, true))}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
