# Slotwise

Share one link, set your hours once, and let clients book you without the back-and-forth.

This repo is at **Phase 0 (Foundations)** of the v1 PRD: tooling, auth, database schema and
CI are in place; features F1–F5 are stubbed under `src/features/`.

## Stack

Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS v4 + shadcn/ui · Drizzle ORM +
PostgreSQL · Auth.js v5 (magic link via Resend, Google OAuth) · Zod · date-fns + @date-fns/tz ·
Vitest · Playwright · GitHub Actions

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
- **Manage links:** 256-bit random tokens, only the SHA-256 hash is stored.
- **Reschedules are in-place updates** that bump `ics_sequence` (same ICS UID), with each change
  logged in `booking_events` for the booking-history panel.
- **Idempotent emails:** `email_log.idempotency_key` is unique, so retried reminder jobs can't
  double-send.

Additions beyond the PRD data model: Auth.js tables (`accounts`, `sessions`,
`verification_tokens`), `users.reminder_policy` and `users.cancel_cutoff_min` (F4/F5 settings),
`booking_events`, and `bookings.cancelled_by` / `cancelled_at`.

## CI

`.github/workflows/ci.yml` runs on every PR: lint, type-check, format check and unit tests; a
schema-drift check plus migrations and DB tests against Postgres 16; and a production build with
Playwright E2E. Vercel's GitHub integration handles preview deploys; run `pnpm db:migrate` against
the target database as part of the deploy.

## Not set up yet (by phase)

- Phase 2: Upstash rate limiting, Cloudflare Turnstile
- Phase 3: Resend + React Email templates, `ics`, Inngest/Trigger.dev for reminders
- Phase 4: FullCalendar
- Phase 5: Sentry, PostHog
