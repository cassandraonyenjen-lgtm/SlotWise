# Slotwise

Share one link, set your hours once, and let clients book you without the back-and-forth.

All v1 phases of the PRD are built: foundations, availability (F1), meeting types with the
public booking page (F2), the host calendar (F3), email confirmations and reminders (F4),
reschedule/cancel (F5), and launch hardening (rate limits, bot checks, error tracking,
analytics, security headers, data export/deletion, legal pages, accessibility checks).

## Stack

Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS v4 + shadcn/ui · Drizzle ORM +
PostgreSQL · Auth.js v5 (magic link via Resend, Google OAuth) · Zod · date-fns + @date-fns/tz ·
Resend + React Email · Inngest · FullCalendar · Upstash Ratelimit · Cloudflare Turnstile · Sentry ·
PostHog · Vitest · Playwright (+ axe) · GitHub Actions

## Getting started

Requires Node 22+, pnpm 10, and Docker (or any Postgres 14+ with `btree_gist`).

```bash
pnpm install
cp .env.example .env.local     # then fill in AUTH_SECRET (npx auth secret)
cp .env.example .env           # drizzle-kit and the migrate script read .env
pnpm db:up                     # local Postgres on :5432
pnpm db:migrate
pnpm dev
```

Sign-in providers switch on when their keys are set: `AUTH_RESEND_KEY` for magic links,
`AUTH_GOOGLE_ID` + `AUTH_GOOGLE_SECRET` for Google.

Booking emails print to the server log until a Resend key is set. Reminders need Inngest:
run `pnpm dlx inngest-cli@latest dev` next to `pnpm dev` and set `INNGEST_DEV=1`. In
production, set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` and point Inngest at
`/api/inngest`. See `src/features/emails/README.md`, including the SPF/DKIM/DMARC setup.

## Scripts

| Script             | What it does                                       |
| ------------------ | -------------------------------------------------- |
| `pnpm dev`         | Next dev server                                    |
| `pnpm lint`        | ESLint                                             |
| `pnpm typecheck`   | `tsc --noEmit`                                     |
| `pnpm format`      | Prettier (with Tailwind class sorting)             |
| `pnpm test`        | Unit tests (Vitest, `src/**/*.test.ts`)            |
| `pnpm test:db`     | Database tests against `DATABASE_URL` (`tests/db`) |
| `pnpm test:e2e`    | Playwright, desktop Chrome + Pixel 7               |
| `pnpm db:generate` | Generate a migration from `src/db/schema.ts`       |
| `pnpm db:migrate`  | Apply migrations in `drizzle/`                     |
| `pnpm db:studio`   | Drizzle Studio                                     |

## Layout

```
src/
  app/                    routes (thin; import from features/)
    (dashboard)/dashboard   host dashboard, auth-gated in layout.tsx
    [username]/[meetingType] public booking pages
    manage/[token]          invitee reschedule/cancel (noindex, no-referrer)
    sign-in/                magic link + Google
  auth.ts                 Auth.js config (database sessions, Drizzle adapter)
  db/schema.ts            full v1 data model
  features/               F1–F5, one folder each (see features/README.md)
  inngest/                background jobs (email notifications, reminders)
  lib/                    tokens, username rules, utils
  components/ui/          shadcn/ui components
drizzle/                  SQL migrations (0001 = double-booking exclusion constraint)
tests/db/                 constraint tests incl. 50-concurrent-request race
e2e/                      Playwright smoke tests
```

## Key decisions already encoded

- **No double-booking, enforced by Postgres.** `bookings_no_overlap` is an `EXCLUDE USING gist`
  constraint on `(user_id, tstzrange(start_at, end_at, '[)'))` for non-cancelled bookings. It's in
  a hand-written migration because Drizzle can't express it. `tests/db` proves 50 concurrent
  inserts for one slot yield exactly one booking. Catch losers with `isSlotTakenError`.
- **Time:** bookings are `timestamptz` (UTC); availability is wall-clock `time` + the host's
  IANA zone on `users.timezone`.
- **Manage links:** HMAC-SHA256 of the booking id with `MANAGE_LINK_SECRET`; only the SHA-256
  hash is stored, and background jobs rebuild links without the token passing through a queue.
- **Reschedules are in-place updates** that bump `ics_sequence` (same ICS UID), with each change
  logged in `booking_events` for the booking-history panel. Writes to one host's bookings take
  a transaction advisory lock first, so racing requests queue instead of deadlocking in the
  exclusion check.
- **Idempotent emails:** `email_log.idempotency_key` is unique, so retried reminder jobs can't
  double-send.

Additions beyond the PRD data model: Auth.js tables (`accounts`, `sessions`,
`verification_tokens`), `users.reminder_policy` and `users.cancel_cutoff_min` (F4/F5 settings),
`booking_events`, and `bookings.cancelled_by` / `cancelled_at`.

## CI

`.github/workflows/ci.yml` runs on every PR: lint, type-check, format check and unit tests; a
schema-drift check plus migrations and DB tests against Postgres 16; and a production build with
Playwright E2E. Vercel's GitHub integration handles deploys. On Vercel the `vercel-build` script runs
`pnpm db:migrate` before `next build`, so each deploy applies new migrations to its own
`DATABASE_URL` first (migrations are recorded, so re-running is a no-op).

## Launch hardening

- **Abuse:** rate limits (`src/lib/rate-limit.ts`) on the slots API, booking, manage links and
  magic-link sign-in, shared through Upstash Redis when it's configured and per-server in
  memory otherwise. Turnstile guards the booking form when its keys are set.
- **Errors:** Sentry on server, edge and browser, only when a DSN is set. Manage-link tokens
  are replaced with `/manage/[token]` in every event, breadcrumb and log line
  (`src/lib/scrub.ts`). Server logs are one JSON object per line (`src/lib/log.ts`).
- **Analytics:** PostHog without cookies (in-memory persistence, no autocapture). Server-side
  events for sign-up, availability, meeting types, and booking created/rescheduled/cancelled.
- **Headers:** CSP, `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy, a
  permissions policy, and HSTS in production (`next.config.ts`).
- **Privacy:** data export and account deletion on Settings; privacy, terms and cookie pages.
- **Accessibility:** `e2e/a11y.spec.ts` runs axe (WCAG 2.2 AA rules) on the public, manage and
  dashboard pages. Animations respect `prefers-reduced-motion`.

## Before launch

1. Have a lawyer review `/privacy`, `/terms` and `/cookies`, and set `LEGAL_CONTACT_EMAIL`.
2. Verify the sending domain in Resend with SPF, DKIM and DMARC (see `src/features/emails`).
3. Add the Resend webhook and `RESEND_WEBHOOK_SECRET`.
4. Set the Upstash, Turnstile, Sentry and PostHog keys from `.env.example` in Vercel.
5. Point an uptime monitor at `/api/health`; alert when it isn't 200 or `emailFailureRate`
   is above 0.02.
