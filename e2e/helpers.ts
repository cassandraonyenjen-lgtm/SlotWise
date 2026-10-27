import type { BrowserContext } from "@playwright/test";
import postgres from "postgres";

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for E2E tests that seed data");
  return postgres(url, { max: 1, onnotice: () => {} });
}

export interface SeededHost {
  userId: string;
  username: string;
}

/**
 * Creates a host. Default hours are Mon–Fri 09:00–17:00; `everyDay` opens all seven days so
 * booking tests always find a slot whenever CI runs.
 */
export async function createHost(
  opts: {
    timezone?: string;
    username?: boolean;
    everyDay?: boolean;
    meetingType?: { slug: string; name: string; requiredQuestion?: string };
  } = {},
): Promise<SeededHost> {
  const sql = db();
  const userId = crypto.randomUUID();
  const username = opts.username ? `e2e-${userId.slice(0, 8)}` : "";
  try {
    await sql`insert into users (id, email, name, timezone, username)
              values (${userId}, ${`e2e-${userId}@example.com`}, 'E2E Host',
                      ${opts.timezone ?? "Africa/Lagos"}, ${username || null})`;
    const weekdays = opts.everyDay ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
    for (const weekday of weekdays) {
      await sql`insert into availability_rules (user_id, weekday, start_time, end_time)
                values (${userId}, ${weekday}, ${opts.everyDay ? "00:00" : "09:00"},
                        ${opts.everyDay ? "24:00" : "17:00"})`;
    }
    if (opts.meetingType) {
      const [mt] = await sql<{ id: string }[]>`
        insert into meeting_types (user_id, slug, name, duration_min, location_type, location_value,
                                   min_notice_min, max_days_ahead)
        values (${userId}, ${opts.meetingType.slug}, ${opts.meetingType.name}, 30, 'video_link',
                'https://meet.example.com/e2e', 0, 14)
        returning id`;
      if (opts.meetingType.requiredQuestion) {
        await sql`insert into custom_questions (meeting_type_id, label, type, required, position)
                  values (${mt!.id}, ${opts.meetingType.requiredQuestion}, 'short_text', true, 0)`;
      }
    }
  } finally {
    await sql.end();
  }
  return { userId, username };
}

/** Signs the browser in as `userId` by writing an Auth.js database session directly. */
export async function signIn(context: BrowserContext, userId: string) {
  const sql = db();
  const sessionToken = crypto.randomUUID();
  try {
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
}

/** A fresh host with default hours, signed in. */
export async function signInAsNewHost(context: BrowserContext, timezone = "Africa/Lagos") {
  const host = await createHost({ timezone });
  await signIn(context, host.userId);
  return host;
}

export async function countBookings(userId: string): Promise<number> {
  const sql = db();
  try {
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from bookings where user_id = ${userId} and status = 'confirmed'`;
    return row!.n;
  } finally {
    await sql.end();
  }
}
