import type { Metadata } from "next";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { EmailSettingsForm } from "@/features/emails/components/email-settings-form";
import { getEmailSettings } from "@/features/emails/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  const settings = await getEmailSettings(getDb(), session!.user.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <EmailSettingsForm
        initial={{
          name: settings?.name ?? "",
          reminderPolicy: settings?.reminderPolicy ?? "24h",
        }}
      />
    </div>
  );
}
