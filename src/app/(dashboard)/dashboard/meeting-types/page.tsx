import type { Metadata } from "next";
import Link from "next/link";
import { requireUserId } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getDb } from "@/db";
import { env } from "@/env";
import { UsernameForm } from "@/features/booking-page/components/username-form";
import { getUsername, listMeetingTypes } from "@/features/booking-page/meeting-types";
import { LOCATION_LABELS, MAX_MEETING_TYPES } from "@/features/booking-page/schemas";

export const metadata: Metadata = { title: "Meeting types" };

export default async function MeetingTypesPage() {
  const userId = await requireUserId();

  const db = getDb();
  const [user, types] = await Promise.all([getUsername(db, userId), listMeetingTypes(db, userId)]);
  const appUrl = env().NEXT_PUBLIC_APP_URL;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Meeting types</h1>
        {types.length < MAX_MEETING_TYPES && (
          <Button asChild>
            <Link href="/dashboard/meeting-types/new">New meeting type</Link>
          </Button>
        )}
      </div>

      <UsernameForm current={user?.username ?? null} appUrl={appUrl} />

      {types.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground text-sm">
            No meeting types yet. Create one, like a 30-minute intro call, to start taking bookings.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Your meeting types">
          {types.map((t) => (
            <li key={t.id}>
              <Card className="h-full gap-3">
                <CardContent className="flex h-full flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold">{t.name}</h2>
                    {!t.isActive && (
                      <span className="bg-muted text-muted-foreground rounded px-2 py-0.5 text-xs">
                        Off
                      </span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t.durationMin} min · {LOCATION_LABELS[t.locationType]}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-2">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/meeting-types/${t.id}`} aria-label={`Edit ${t.name}`}>
                        Edit
                      </Link>
                    </Button>
                    {user?.username && t.isActive && (
                      <Button asChild variant="ghost" size="sm">
                        <a href={`/${user.username}/${t.slug}`} target="_blank">
                          Open booking page
                        </a>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
