import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getDb } from "@/db";
import { getPublicHost } from "@/features/booking-page/public";
import { LOCATION_LABELS } from "@/features/booking-page/schemas";

type Params = { params: Promise<{ username: string }> };

const load = cache((username: string) => getPublicHost(getDb(), username));

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).username);
  return { title: page ? `Book time with ${page.host.name ?? page.host.username}` : "Not found" };
}

/** Public host page: slotwise.app/<username> lists the host's active meeting types (F2.2). */
export default async function HostPage({ params }: Params) {
  const page = await load((await params).username);
  if (!page) notFound();
  const { host, meetingTypes } = page;
  const name = host.name ?? host.username;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-1">
        <p className="text-primary text-sm font-semibold">Slotwise</p>
        <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
        <p className="text-muted-foreground">Choose a meeting type to see available times.</p>
      </header>
      {meetingTypes.length === 0 ? (
        <p className="text-muted-foreground">{name} isn&apos;t taking bookings right now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {meetingTypes.map((t) => (
            <li key={t.slug}>
              <Link
                href={`/${host.username}/${t.slug}`}
                className="group block rounded-xl focus-visible:outline-none"
              >
                <Card className="group-hover:border-primary group-focus-visible:ring-ring/50 gap-1 py-4 transition-colors group-focus-visible:ring-[3px]">
                  <CardContent className="flex flex-col gap-1">
                    <h2 className="font-semibold">{t.name}</h2>
                    <p className="text-muted-foreground text-sm">
                      {t.durationMin} min · {LOCATION_LABELS[t.locationType]}
                    </p>
                    {t.description && <p className="text-sm">{t.description}</p>}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
