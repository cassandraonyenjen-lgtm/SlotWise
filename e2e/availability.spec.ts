import { expect, test } from "@playwright/test";
import { signInAsNewHost } from "./helpers";

test.beforeEach(async ({ context }) => {
  await signInAsNewHost(context);
});

test("host edits weekly hours, with overlapping ranges rejected (F1.1)", async ({ page }) => {
  await page.goto("/dashboard/availability");
  const monday = page.getByTestId("weekday-monday");
  await expect(monday.getByLabel("Monday start time 1")).toHaveValue("09:00");
  await expect(page.getByTestId("weekday-saturday")).toContainText("Unavailable");

  await monday.getByRole("button", { name: "+ Add hours" }).click();
  await monday.getByLabel("Monday start time 2").fill("10:00");
  await monday.getByLabel("Monday end time 2").fill("11:00");
  await page.getByRole("button", { name: "Save weekly hours" }).click();
  await expect(monday).toContainText("Monday: 09:00–17:00 overlaps 10:00–11:00");

  await monday.getByLabel("Monday start time 2").fill("18:00");
  await monday.getByLabel("Monday end time 2").fill("19:30");
  await page.getByRole("button", { name: "Save weekly hours" }).click();
  await expect(page.getByText("Weekly hours saved.")).toBeVisible();

  // Turn Friday off too, then confirm both changes survive a reload.
  await page.getByLabel("Friday", { exact: true }).uncheck();
  await page.getByRole("button", { name: "Save weekly hours" }).click();
  await expect(page.getByText("Weekly hours saved.")).toBeVisible();

  await page.reload();
  await expect(monday.getByLabel("Monday start time 2")).toHaveValue("18:00");
  await expect(monday.getByLabel("Monday end time 2")).toHaveValue("19:30");
  await expect(page.getByTestId("weekday-friday")).toContainText("Unavailable");
});

test("host blocks dates and sets custom hours (F1.2, F1.3)", async ({ page }) => {
  await page.goto("/dashboard/availability");
  const changes = page.getByRole("list", { name: "Upcoming date changes" });

  await page.getByLabel("From", { exact: true }).fill("2030-12-24");
  await page.getByLabel("To", { exact: true }).fill("2030-12-26");
  await page.getByRole("button", { name: "Block these dates" }).click();
  await expect(page.getByText("Dates blocked.")).toBeVisible();
  await expect(changes.getByRole("listitem")).toHaveCount(3);
  await expect(changes).toContainText("Tue, 24 Dec 2030 Unavailable all day");

  await page.getByLabel("Custom hours on a date").check();
  await page.getByLabel("Date", { exact: true }).fill("2030-12-28");
  await page.getByLabel("Custom start time 1").fill("10:00");
  await page.getByLabel("Custom end time 1").fill("12:00");
  await page.getByRole("button", { name: "Save hours for this date" }).click();
  await expect(changes).toContainText("Sat, 28 Dec 2030 10:00–12:00");

  await page.getByRole("button", { name: "Remove change on Wed, 25 Dec 2030" }).click();
  await expect(changes.getByRole("listitem")).toHaveCount(3);
  await expect(changes).not.toContainText("25 Dec 2030");
});

test("host changes time zone", async ({ page }) => {
  await page.goto("/dashboard/availability");
  const select = page.getByLabel("Your time zone");
  await expect(select).toHaveValue("Africa/Lagos");
  await select.selectOption("Europe/London");
  await expect(page.getByText("Time zone set to Europe/London.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Your time zone")).toHaveValue("Europe/London");
});
