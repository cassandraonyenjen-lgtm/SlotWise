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

F1 (Phase 1), F2 (Phase 2) and F4 (Phase 3) are built. The others are still Phase 0 stubs; functions that aren't built yet throw `NotImplementedError`.
