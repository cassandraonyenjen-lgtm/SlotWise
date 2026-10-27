# Features

One folder per v1 feature from the PRD. Each folder owns its domain logic, Zod schemas,
server actions and feature-specific components. Route files in `src/app` stay thin and
import from here.

| Folder                | PRD                                    | Phase | Routes                                                                 |
| --------------------- | -------------------------------------- | ----- | ---------------------------------------------------------------------- |
| `availability/`       | F1 Availability Management             | 1     | `/dashboard/availability`                                              |
| `booking-page/`       | F2 Meeting Types & Public Booking Page | 2     | `/dashboard/meeting-types`, `/[username]`, `/[username]/[meetingType]` |
| `emails/`             | F4 Email Confirmations & Reminders     | 3     | `/dashboard/settings`, `/api/inngest` (background jobs)                |
| `calendar/`           | F3 Calendar View                       | 4     | `/dashboard`, `/dashboard/calendar`                                    |
| `booking-management/` | F5 Reschedule & Cancel                 | 4     | `/manage/[token]`                                                      |
| `account/`            | §8 Privacy (data export, deletion)     | 5     | `/dashboard/settings`, `/api/account/export`                           |

All five v1 features are built: F1 (Phase 1), F2 (Phase 2), F4 (Phase 3), and F3 and F5 (Phase 4).
Phase 5 added launch hardening around them: `account/` here, plus shared pieces in `src/lib`
(rate limits, Turnstile, logging, analytics, token scrubbing).
