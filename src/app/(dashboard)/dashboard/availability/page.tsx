import type { Metadata } from "next";
import { FeaturePlaceholder } from "@/components/feature-placeholder";

export const metadata: Metadata = { title: "Availability" };

export default function AvailabilityPage() {
  return <FeaturePlaceholder title="Availability" feature="F1 Availability Management" phase={1} />;
}
