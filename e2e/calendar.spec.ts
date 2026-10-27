import { expect, test } from "@playwright/test";
import { createHost, daysFromNow, getBooking, insertBooking, signIn } from "./helpers";

test("host sees a booking, its details, and cancels it with a message (F3.1, F3.2, F5.3)", async ({
  context,
  page,
  isMobile,
}) => {
  const host = await createHost({
    username: true,
    everyDay: true,
    meetingType: { slug: "intro", name: "Intro call" },
  });
  await signIn(context, host.userId);
  const { bookingId } = await insertBooking(host, daysFromNow(1), {
    inviteeName: "Grace Hopper",
    inviteeTimezone: "America/New_York",
  });

  await page.goto("/dashboard/calendar");
  // Phones get the agenda list; larger screens the week grid (F3.3).
  await expect(page.locator(isMobile ? ".fc-list" : ".fc-timeGridWeek-view")).toBeVisible();
  await page.getByText("Grace Hopper · Intro call").first().click();

  const panel = page.getByRole("complementary", { name: "Grace Hopper" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("ada@example.com")).toBeVisible();
  await expect(panel.getByText(/Their time: .*America\/New York/)).toBeVisible();
  await expect(panel.getByText("Booked by the invitee")).toBeVisible();

  await panel.getByRole("button", { name: "Cancel booking" }).click();
  await panel.getByLabel("Message (optional)").fill("Sorry, I'm ill");
  await panel.getByRole("button", { name: "Cancel and notify" }).click();
  await expect(panel.getByTestId("booking-status")).toHaveText("Cancelled");
  await expect(panel.getByText("Cancelled by you: “Sorry, I'm ill”")).toBeVisible();

  const row = await getBooking(bookingId);
  expect(row.status).toBe("cancelled");
  // Cancelled bookings leave the calendar.
  await page.reload();
  await expect(page.getByText("Grace Hopper · Intro call")).toHaveCount(0);
});

test("host reschedules from the dashboard and marks a past meeting as a no-show (F5.3, F3.5)", async ({
  context,
  page,
}) => {
  const host = await createHost({
    username: true,
    everyDay: true,
    meetingType: { slug: "intro", name: "Intro call" },
  });
  await signIn(context, host.userId);
  const { bookingId } = await insertBooking(host, daysFromNow(2), { inviteeName: "Ada" });
  const { bookingId: pastId } = await insertBooking(host, daysFromNow(-1), {
    inviteeName: "Linus",
  });

  await page.goto(`/dashboard/calendar?booking=${bookingId}`);
  const panel = page.getByRole("complementary", { name: "Ada" });
  await panel.getByRole("button", { name: "Reschedule" }).click();
  await panel.getByRole("group", { name: "Available times" }).getByRole("button").first().click();
  await panel.getByLabel("Message (optional)").fill("Can we do earlier?");
  await panel.getByRole("button", { name: "Move and notify" }).click();
  await expect(panel.getByText(/Moved by you from/)).toBeVisible();
  expect((await getBooking(bookingId)).ics_sequence).toBe(1);

  await page.goto(`/dashboard/calendar?booking=${pastId}`);
  const past = page.getByRole("complementary", { name: "Linus" });
  await expect(past.getByRole("button", { name: "Reschedule" })).toHaveCount(0);
  await past.getByRole("button", { name: "Mark as no-show" }).click();
  await expect(past.getByTestId("booking-status")).toHaveText("No-show");
  expect((await getBooking(pastId)).status).toBe("no_show");
});

test("today page lists upcoming meetings and links to them", async ({ context, page }) => {
  const host = await createHost({
    username: true,
    everyDay: true,
    meetingType: { slug: "intro", name: "Intro call" },
  });
  await signIn(context, host.userId);
  await insertBooking(host, daysFromNow(3), { inviteeName: "Katherine" });

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Coming up" })).toBeVisible();
  await page.getByRole("link", { name: /Katherine · Intro call/ }).click();
  await expect(page.getByRole("complementary", { name: "Katherine" })).toBeVisible();
});
