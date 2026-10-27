import { Webhook } from "svix";
import { getDb } from "@/db";
import { env } from "@/env";
import { applyResendEvent, type ResendEvent } from "@/features/emails/webhooks";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Resend delivery webhooks (bounces, complaints, deliveries). Point Resend at
 * /api/webhooks/resend and set RESEND_WEBHOOK_SECRET; requests are verified with Svix.
 */
export async function POST(request: Request) {
  const secret = env().RESEND_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhook not configured" }, { status: 404 });

  const payload = await request.text();
  try {
    new Webhook(secret).verify(payload, {
      "svix-id": request.headers.get("svix-id") ?? "",
      "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    });
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(payload) as ResendEvent;
  const changed = await applyResendEvent(getDb(), event);
  if (event.type === "email.bounced" || event.type === "email.complained") {
    log.warn("email problem reported", { type: event.type, emailId: event.data?.email_id });
  }
  return Response.json({ ok: true, changed });
}
