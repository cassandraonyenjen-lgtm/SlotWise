import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Uptime check for monitors (PRD §8: 99.9% target). 503 when the database is unreachable.
 * Also reports the last 24h email failure rate, so a monitor can alert above 2%.
 */
export async function GET() {
  try {
    const [row] = await getDb().execute<{ total: number; failed: number }>(sql`
      select count(*)::int as total,
             count(*) filter (where status in ('failed', 'bounced'))::int as failed
      from email_log where created_at > now() - interval '24 hours'`);
    const total = Number(row?.total ?? 0);
    const failed = Number(row?.failed ?? 0);
    const emailFailureRate = total ? failed / total : 0;
    return Response.json(
      { ok: true, db: true, emails24h: total, emailFailureRate },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    log.error("health check failed", { error });
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
}
