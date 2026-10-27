import type { Metadata } from "next";
import { requireUserId } from "@/auth";
import { getDb } from "@/db";
import { AccountCard } from "@/features/account/components/account-card";
import { CutoffForm } from "@/features/booking-management/components/cutoff-form";
import { getCancelCutoff } from "@/features/booking-management/settings";
import { EmailSettingsForm } from "@/features/emails/components/email-settings-form";
import { getEmailSettings } from "@/features/emails/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const userId = await requireUserId();
  const db = getDb();
  const [settings, cutoff] = await Promise.all([
    getEmailSettings(db, userId),
    getCancelCutoff(db, userId),
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
      <AccountCard />
    </div>
  );
}
