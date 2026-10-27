import { eq } from "drizzle-orm";
import type { Database } from "@/db";
import { users } from "@/db/schema";

export async function getCancelCutoff(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ cancelCutoffMin: users.cancelCutoffMin })
    .from(users)
    .where(eq(users.id, userId));
  return row?.cancelCutoffMin ?? 0;
}

export async function saveCancelCutoff(db: Database, userId: string, minutes: number) {
  await db.update(users).set({ cancelCutoffMin: minutes }).where(eq(users.id, userId));
}
