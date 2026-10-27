import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { users } from "@/db/schema";
import type { EmailSettings } from "./schemas";

export async function getEmailSettings(db: Database, userId: string) {
  const [row] = await db
    .select({ name: users.name, reminderPolicy: users.reminderPolicy, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}

export async function saveEmailSettings(db: Database, userId: string, settings: EmailSettings) {
  await db
    .update(users)
    .set({ name: settings.name, reminderPolicy: settings.reminderPolicy })
    .where(eq(users.id, userId));
}
