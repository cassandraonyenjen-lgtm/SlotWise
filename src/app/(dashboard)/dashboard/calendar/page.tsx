import type { Metadata } from "next";
import { FeaturePlaceholder } from "@/components/feature-placeholder";

export const metadata: Metadata = { title: "Calendar" };

export default function CalendarPage() {
  return <FeaturePlaceholder title="Calendar" feature="F3 Calendar View" phase={4} />;
}
