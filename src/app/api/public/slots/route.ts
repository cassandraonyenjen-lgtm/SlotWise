import type { NextRequest } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { getPublicSlots } from "@/features/booking-page/public";
import { RATE_LIMITED_MESSAGE, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  username: z.string().min(1).max(64),
  slug: z.string().min(1).max(64),
  from: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  to: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
});

/**
 * Public slot list for one meeting type: GET /api/public/slots?username&slug&from&to.
 * Returns UTC start times; the browser renders them in the invitee's zone (F2.3).
 */
export async function GET(request: NextRequest) {
  const limited = await rateLimit("slots");
  if (!limited.ok) {
    return Response.json(
      { error: RATE_LIMITED_MESSAGE },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return Response.json({ error: "Invalid query" }, { status: 400 });

  const { username, slug, from, to } = parsed.data;
  const slots = await getPublicSlots(getDb(), username, slug, from, to);
  if (!slots) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(
    { slots: slots.map((s) => s.startAt.toISOString()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
