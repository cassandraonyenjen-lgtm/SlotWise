import { notFound } from "next/navigation";
import { FeaturePlaceholder } from "@/components/feature-placeholder";
import { isReservedUsername } from "@/lib/usernames";

/** Public booking page for one meeting type: slot picker + booking form. */
export default async function BookMeetingPage({
  params,
}: {
  params: Promise<{ username: string; meetingType: string }>;
}) {
  const { username, meetingType } = await params;
  if (isReservedUsername(username)) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <FeaturePlaceholder
        title={`${username} / ${meetingType}`}
        feature="F2 Booking flow"
        phase={2}
      />
    </main>
  );
}
