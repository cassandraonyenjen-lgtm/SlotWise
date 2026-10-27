import { and, eq, notInArray } from "drizzle-orm";
import type { Database } from "@/db";
import { emailLog } from "@/db/schema";

/** The Resend webhook events we act on (PRD §8 deliverability: bounce/complaint handling). */
export interface ResendEvent {
  type: string;
  data: { email_id?: string };
}

const STATUS_BY_TYPE = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
} as const;

/**
 * Records delivery, bounces and complaints on the matching email_log row. A bounce or
 * complaint is final: a late "delivered" never overwrites it. Returns whether a row changed.
 */
export async function applyResendEvent(db: Database, event: ResendEvent): Promise<boolean> {
  const status = STATUS_BY_TYPE[event.type as keyof typeof STATUS_BY_TYPE];
  const providerId = event.data?.email_id;
  if (!status || !providerId) return false;
  const final = ["bounced", "complained"] as const;
  const rows = await db
    .update(emailLog)
    .set({ status })
    .where(
      and(
        eq(emailLog.providerId, providerId),
        status === "delivered" ? notInArray(emailLog.status, [...final]) : undefined,
      ),
    )
    .returning({ id: emailLog.id });
  return rows.length > 0;
}
