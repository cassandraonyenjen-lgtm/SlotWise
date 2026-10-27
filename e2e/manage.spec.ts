import { expect, test } from "@playwright/test";
import { createHost, daysFromNow, getBooking, insertBooking } from "./helpers";

test.use({ timezoneId: "Europe/London" });

async function hostWithBooking(days = 2) {
  const host = await createHost({
    username: true,
    everyDay: true,
    meetingType: { slug: "intro", name: "Intro call" },
  });
  const booking = await insertBooking(host, daysFromNow(days));
  return { host, ...booking };
}

test("invitee reschedules from their email link (F5.1)", async ({ page }) => {
  const { bookingId, token } = await hostWithBooking();
  const before = await getBooking(bookingId);

  await page.goto(`/manage/${token}?action=reschedule`);
  await expect(page.getByRole("heading", { name: "Your booking" })).toBeVisible();
  await expect(page.getByText("Intro call with E2E Host")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pick a new time" })).toBeVisible();
  await expect(page.getByLabel("Times are shown in")).toHaveValue("Europe/London");

  const times = page.getByRole("group", { name: "Available times" });
  await times.getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: "Move your meeting?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm new time" }).click();
  await expect(page.getByRole("heading", { name: "You're rescheduled" })).toBeVisible();

  const after = await getBooking(bookingId);
  expect(after.status).toBe("confirmed");
  expect(after.ics_sequence).toBe(1);
  expect(after.start_at.getTime()).not.toBe(before.start_at.getTime());
});

test("invitee cancels with a reason, and the link then says so (F5.2)", async ({ page }) => {
  const { bookingId, token } = await hostWithBooking();

  await page.goto(`/manage/${token}`);
  await page.getByRole("button", { name: "Cancel meeting" }).click();
  await page.getByLabel("Reason (optional)").fill("Something came up");
  await page.getByRole("button", { name: "Cancel meeting" }).click();
  await expect(page.getByRole("heading", { name: "Your meeting is cancelled" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Book another time" })).toBeVisible();

  const row = await getBooking(bookingId);
  expect(row.status).toBe("cancelled");
  expect(row.cancel_reason).toBe("Something came up");

  await page.reload();
  await expect(page.getByText("This meeting has been cancelled.")).toBeVisible();
});

test("bad links and links inside the cutoff can't change anything (F5.4, F5.5)", async ({
  page,
}) => {
  await page.goto(`/manage/${"x".repeat(43)}`);
  await expect(page.getByRole("heading", { name: "This link isn't valid" })).toBeVisible();

  // A meeting in about an hour, with a 24-hour cutoff.
  const host = await createHost({
    username: true,
    everyDay: true,
    meetingType: { slug: "intro", name: "Intro call" },
  });
  const soon = new Date(Math.ceil((Date.now() + 60 * 60_000) / 1_800_000) * 1_800_000);
  const { token } = await insertBooking(host, soon);
  const { default: postgres } = await import("postgres");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  await sql`update users set cancel_cutoff_min = 1440 where id = ${host.userId}`;
  await sql.end();

  await page.goto(`/manage/${token}`);
  await expect(page.getByText("too close to the meeting to change it online")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reschedule" })).toHaveCount(0);
});
