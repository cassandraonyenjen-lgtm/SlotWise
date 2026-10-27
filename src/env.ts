import { z } from "zod";

/**
 * Server-side environment, validated once at first use so a missing secret fails loudly
 * instead of surfacing as a confusing runtime error deep in a request.
 */
const serverSchema = z.object({
  DATABASE_URL: z.url(),
  AUTH_SECRET: z.string().min(1).optional(),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_RESEND_KEY: z.string().optional(),
  /** Transactional email. Falls back to AUTH_RESEND_KEY; without either, emails are logged. */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Slotwise <no-reply@example.com>"),
  /** Set in production (Inngest Cloud) to send events; INNGEST_DEV=1 uses the local dev server. */
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_DEV: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (!cached) {
    const parsed = serverSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}
