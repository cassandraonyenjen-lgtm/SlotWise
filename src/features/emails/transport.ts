import { Resend } from "resend";
import { env } from "@/env";
import { log } from "@/lib/log";

export interface OutgoingEmail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: string; contentType: string }[];
  idempotencyKey: string;
}

export interface EmailTransport {
  send(email: OutgoingEmail): Promise<{ id: string }>;
}

/** Resend, with its own idempotency key as a second guard against double sends. */
export class ResendTransport implements EmailTransport {
  private client: Resend;
  constructor(apiKey: string) {
    this.client = new Resend(apiKey);
  }
  async send(email: OutgoingEmail) {
    const { data, error } = await this.client.emails.send(
      {
        from: email.from,
        to: email.to,
        replyTo: email.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: email.attachments,
      },
      { idempotencyKey: email.idempotencyKey },
    );
    if (error || !data) throw new Error(`Resend: ${error?.message ?? "no response"}`);
    return { id: data.id };
  }
}

/** Development fallback when no Resend key is set: logs instead of sending. */
export class ConsoleTransport implements EmailTransport {
  async send(email: OutgoingEmail) {
    log.info("email logged instead of sent", {
      subject: email.subject,
      idempotencyKey: email.idempotencyKey,
    });
    return { id: `console-${email.idempotencyKey}` };
  }
}

/** Collects emails in memory, for tests. */
export class MemoryTransport implements EmailTransport {
  sent: OutgoingEmail[] = [];
  failNext = 0;
  async send(email: OutgoingEmail) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("Simulated provider failure");
    }
    this.sent.push(email);
    return { id: `mem-${this.sent.length}` };
  }
}

export function getTransport(): EmailTransport {
  const e = env();
  const key = e.RESEND_API_KEY ?? e.AUTH_RESEND_KEY;
  if (key) return new ResendTransport(key);
  if (e.NODE_ENV === "production") {
    log.warn("No RESEND_API_KEY set; emails are only being logged.");
  }
  return new ConsoleTransport();
}
