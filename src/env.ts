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
  /** Rate limits are shared across instances via Upstash; without it each instance counts alone. */
  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  /** Cloudflare Turnstile on the public booking form. Both unset = check skipped. */
  TURNSTILE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
  /** Resend webhook signing secret, for bounce and complaint events. */
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  /** Server-side product analytics. Unset = no events sent. */
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.url().default("https://us.i.posthog.com"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

/**
 * On Vercel, the app's own address when NEXT_PUBLIC_APP_URL isn't set: the production domain
 * for production deploys, the deployment's own URL for previews.
 */
function vercelUrl(): string | undefined {
  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;
  return host ? `https://${host}` : undefined;
}

export function env(): ServerEnv {
  if (!cached) {
    const parsed = serverSchema.safeParse({
      ...process.env,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || vercelUrl(),
    });
    if (!parsed.success) {
      throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}
