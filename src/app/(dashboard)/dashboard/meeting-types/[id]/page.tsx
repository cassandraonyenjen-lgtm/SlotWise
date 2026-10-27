import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUserId } from "@/auth";
import { getDb } from "@/db";
import { env } from "@/env";
import { MeetingTypeForm } from "@/features/booking-page/components/meeting-type-form";
import { getMeetingType, getUsername } from "@/features/booking-page/meeting-types";

export const metadata: Metadata = { title: "Edit meeting type" };

export default async function EditMeetingTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const userId = await requireUserId();
  const db = getDb();
  const [user, mt] = await Promise.all([getUsername(db, userId), getMeetingType(db, userId, id)]);
  if (!mt) notFound();
  const host = env().NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, "");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Edit {mt.name}</h1>
      <MeetingTypeForm
        id={mt.id}
        linkPrefix={user?.username ? `${host}/${user.username}/` : null}
        initial={{
          name: mt.name,
          slug: mt.slug,
          durationMin: String(mt.durationMin),
          description: mt.description ?? "",
          locationType: mt.locationType,
          locationValue: mt.locationValue ?? "",
          bufferBeforeMin: String(mt.bufferBeforeMin),
          bufferAfterMin: String(mt.bufferAfterMin),
          minNoticeMin: String(mt.minNoticeMin),
          maxDaysAhead: String(mt.maxDaysAhead),
          dailyLimit: mt.dailyLimit === null ? "" : String(mt.dailyLimit),
          isActive: mt.isActive,
          questions: mt.questions.map((q) => ({
            id: q.id,
            label: q.label,
            type: q.type,
            required: q.required,
          })),
        }}
      />
    </div>
  );
}
