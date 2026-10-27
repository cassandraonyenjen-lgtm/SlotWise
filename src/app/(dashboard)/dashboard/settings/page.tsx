import type { Metadata } from "next";
import { auth } from "@/auth";
import { getDb } from "@/db";
import { CutoffForm } from "@/features/booking-management/components/cutoff-form";
import { getCancelCutoff } from "@/features/booking-management/settings";
import { EmailSettingsForm } from "@/features/emails/components/email-settings-form";
import { getEmailSettings } from "@/features/emails/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  const db = getDb();
  const [settings, cutoff] = await Promise.all([
    getEmailSettings(db, session!.user.id),
    getCancelCutoff(db, session!.user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <EmailSettingsForm
        initial={{
          name: settings?.name ?? "",
          reminderPolicy: settings?.reminderPolicy ?? "24h",
        }}
      />
      <CutoffForm initial={cutoff} />
    </div>
  );
}
