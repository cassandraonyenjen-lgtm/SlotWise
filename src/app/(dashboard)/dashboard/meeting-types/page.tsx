import type { Metadata } from "next";
import { FeaturePlaceholder } from "@/components/feature-placeholder";

export const metadata: Metadata = { title: "Meeting types" };

export default function MeetingTypesPage() {
  return <FeaturePlaceholder title="Meeting types" feature="F2 Meeting Types" phase={2} />;
}
