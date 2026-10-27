import type { Metadata } from "next";
import { FeaturePlaceholder } from "@/components/feature-placeholder";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return <FeaturePlaceholder title="Today" feature="F3 Calendar View — today summary" phase={4} />;
}
