import { notFound } from "next/navigation";
import { FeaturePlaceholder } from "@/components/feature-placeholder";
import { isReservedUsername } from "@/lib/usernames";

/** Public host page: slotwise.app/<username> lists the host's active meeting types. */
export default async function HostPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (isReservedUsername(username)) notFound();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <FeaturePlaceholder title={username} feature="F2 Public Booking Page" phase={2} />
    </main>
  );
}
