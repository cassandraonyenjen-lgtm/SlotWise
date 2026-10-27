import type { BrowserContext } from "@playwright/test";
import postgres from "postgres";

const DEFAULT_HOURS = [1, 2, 3, 4, 5];

/**
 * Creates a fresh host with default Mon–Fri 09:00–17:00 hours and signs the browser in by
 * writing an Auth.js database session directly, so tests don't depend on email or Google.
 */
export async function signInAsNewHost(context: BrowserContext, timezone = "Africa/Lagos") {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for signed-in E2E tests");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const userId = crypto.randomUUID();
  const sessionToken = crypto.randomUUID();
  try {
    await sql`insert into users (id, email, name, timezone)
              values (${userId}, ${`e2e-${userId}@example.com`}, 'E2E Host', ${timezone})`;
    for (const weekday of DEFAULT_HOURS) {
      await sql`insert into availability_rules (user_id, weekday, start_time, end_time)
                values (${userId}, ${weekday}, '09:00', '17:00')`;
    }
    await sql`insert into sessions (session_token, user_id, expires)
              values (${sessionToken}, ${userId}, now() + interval '1 day')`;
  } finally {
    await sql.end();
  }
  const baseURL = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000");
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: sessionToken,
      domain: baseURL.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return { userId };
}
