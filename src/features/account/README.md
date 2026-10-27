# Account (PRD §8 Privacy)

Lets a host take their data with them or leave for good. Lives on `/dashboard/settings`.

- **Download my data** → `GET /api/account/export`: one JSON file with the account, meeting
  types and questions, availability, and every booking with its answers, history and email
  log. Manage-token hashes, sessions and OAuth tokens are left out.
- **Delete my account** (type `DELETE` to confirm): upcoming confirmed bookings are cancelled
  and both sides emailed first, sent inline so nothing waits on a background job that would
  find the host gone. Then bookings and the user row are deleted in one transaction (the rest
  cascades), the session ends, and the host lands on `/?deleted=1`.

Covered by `tests/db/account.test.ts` and `e2e/launch.spec.ts`.
