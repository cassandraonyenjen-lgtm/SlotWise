import { sql } from "drizzle-orm";
import type { Database } from "@/db";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Queues writes to one host's bookings for the rest of the transaction. Without this, racing
 * inserts can deadlock inside the exclusion check, and Postgres only breaks each deadlock
 * after deadlock_timeout (1s). The constraint is still what guarantees no double-booking.
 */
export async function lockHostBookings(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);
}
