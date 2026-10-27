import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { BookingFlow } from "@/features/booking-page/components/booking-flow";
import { getPublicMeetingType } from "@/features/booking-page/public";
import { LOCATION_LABELS } from "@/features/booking-page/schemas";
import { env } from "@/env";

type Params = { params: Promise<{ username: string; meetingType: string }> };

const load = cache((username: string, slug: string) =>
  getPublicMeetingType(getDb(), username, slug),
);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username, meetingType } = await params;
  const found = await load(username, meetingType);
  if (!found) return { title: "Not found" };
  return { title: `${found.meetingType.name} with ${found.host.name ?? found.host.username}` };
}

/** Public booking page for one meeting type (F2.2–F2.6). */
export default async function BookMeetingPage({ params }: Params) {
  const { username, meetingType: slug } = await params;
  const found = await load(username, slug);
  if (!found) notFound();
  const { host, meetingType: mt } = found;
  const hostName = host.name ?? host.username ?? username;

  return (
    <main className="mx-auto grid max-w-4xl gap-8 px-4 py-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <header className="flex flex-col gap-2">
        <Link href={`/${host.username}`} className="text-muted-foreground text-sm hover:underline">
          {hostName}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{mt.name}</h1>
        <p className="text-muted-foreground text-sm">
          {mt.durationMin} min · {LOCATION_LABELS[mt.locationType]}
        </p>
        {mt.description && <p className="text-sm whitespace-pre-line">{mt.description}</p>}
      </header>
      <BookingFlow
        username={host.username!}
        slug={mt.slug}
        durationMin={mt.durationMin}
        maxDaysAhead={mt.maxDaysAhead}
        turnstileSiteKey={env().NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null}
        questions={mt.questions.map((q) => ({
          id: q.id,
          label: q.label,
          type: q.type,
          required: q.required,
        }))}
      />
    </main>
  );
}
