import type { Metadata } from "next";
import { requireUserId } from "@/auth";
import { getDb } from "@/db";
import { env } from "@/env";
import {
  MeetingTypeForm,
  NEW_MEETING_TYPE,
} from "@/features/booking-page/components/meeting-type-form";
import { getUsername } from "@/features/booking-page/meeting-types";

export const metadata: Metadata = { title: "New meeting type" };

export default async function NewMeetingTypePage() {
  const userId = await requireUserId();
  const user = await getUsername(getDb(), userId);
  const host = env().NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, "");

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">New meeting type</h1>
      <MeetingTypeForm
        initial={NEW_MEETING_TYPE}
        linkPrefix={user?.username ? `${host}/${user.username}/` : null}
      />
    </div>
  );
}
