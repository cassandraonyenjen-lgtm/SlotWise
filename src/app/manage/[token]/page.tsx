import type { Metadata } from "next";
import { FeaturePlaceholder } from "@/components/feature-placeholder";

// Tokenized links must never be indexed or leak via referrer.
export const metadata: Metadata = {
  title: "Manage booking",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ManageBookingPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <FeaturePlaceholder title="Manage your booking" feature="F5 Reschedule & Cancel" phase={4} />
    </main>
  );
}
