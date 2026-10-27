import { expect, test, type Page } from "@playwright/test";
import { countBookings, createHost, signIn } from "./helpers";

// Invitees in New York booking a host in Lagos: everything they see must be in their zone.
test.use({ timezoneId: "America/New_York" });

async function pickFirstTime(page: Page) {
  const times = page.getByRole("group", { name: "Available times" });
  await expect(times.getByRole("button").first()).toBeVisible();
  const label = await times.getByRole("button").first().innerText();
  await times.getByRole("button").first().click();
  return label;
}

test("invitee books in their own time zone without an account (F2.3, F2.4, F2.5)", async ({
  page,
}) => {
  const host = await createHost({
    username: true,
    everyDay: true,
    meetingType: { slug: "intro", name: "Intro call", requiredQuestion: "Company name" },
  });

  await page.goto(`/${host.username}`);
  await page.getByRole("link", { name: /Intro call/ }).click();
  await expect(page.getByRole("heading", { name: "Intro call" })).toBeVisible();
  await expect(page.getByLabel("Times are shown in")).toHaveValue("America/New_York");

  const time = await pickFirstTime(page);
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expect(page.getByText("America/New York")).toBeVisible();

  await page.getByLabel("Name", { exact: true }).fill("Ada Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Please answer this question")).toBeVisible();

  await page.getByLabel("Company name").fill("Analytical Engines Ltd");
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page.getByRole("heading", { name: "You're booked" })).toBeVisible();
  await expect(page.getByText("Intro call with E2E Host", { exact: true })).toBeVisible();
  await expect(page.getByText(time, { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Google Calendar" })).toHaveAttribute(
    "href",
    /calendar\.google\.com/,
  );
  await expect(page.getByRole("link", { name: /\.ics/ })).toHaveAttribute("download", /\.ics$/);
  expect(await countBookings(host.userId)).toBe(1);
});

test("switching time zone updates the times shown (F2.3)", async ({ page }) => {
  const host = await createHost({
    username: true,
    everyDay: true,
    meetingType: { slug: "intro", name: "Intro call" },
  });
  await page.goto(`/${host.username}/intro`);
  const firstTime = page
    .getByRole("group", { name: "Available times" })
    .getByRole("button")
    .first();
  await expect(firstTime).toBeVisible();
  const ny = await firstTime.innerText();
  await page.getByLabel("Times are shown in").selectOption("Asia/Tokyo");
  await expect(firstTime).not.toHaveText(ny);
});

test("two people racing for one slot: exactly one wins (F2.6)", async ({ browser }) => {
  const host = await createHost({
    username: true,
    everyDay: true,
    meetingType: { slug: "intro", name: "Intro call" },
  });
  const [a, b] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [pageA, pageB] = await Promise.all([a.newPage(), b.newPage()]);
  for (const [page, name] of [
    [pageA, "First"],
    [pageB, "Second"],
  ] as const) {
    await page.goto(`/${host.username}/intro`);
    await pickFirstTime(page);
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Email").fill(`${name.toLowerCase()}@example.com`);
  }

  await pageA.getByRole("button", { name: "Confirm booking" }).click();
  await expect(pageA.getByRole("heading", { name: "You're booked" })).toBeVisible();

  await pageB.getByRole("button", { name: "Confirm booking" }).click();
  await expect(pageB.getByRole("alert").filter({ hasText: "This time was just taken" })).toHaveText(
    "This time was just taken. Please pick another time.",
  );
  await expect(pageB.getByRole("heading", { name: "Pick a time" })).toBeVisible();
  expect(await countBookings(host.userId)).toBe(1);
  await Promise.all([a.close(), b.close()]);
});

test("host sets a link and creates a meeting type that appears publicly (F2.1, F2.2)", async ({
  context,
  page,
}) => {
  const host = await createHost();
  await signIn(context, host.userId);
  const username = `e2e-new-${host.userId.slice(0, 6)}`;

  await page.goto("/dashboard/meeting-types");
  await page.getByLabel("Username").fill("dashboard");
  await page.getByRole("button", { name: "Save link" }).click();
  await expect(page.getByText("That username is reserved")).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByRole("button", { name: "Save link" }).click();
  await expect(page.getByRole("link", { name: new RegExp(`/${username}$`) })).toBeVisible();

  await page.getByRole("link", { name: "New meeting type" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Strategy Session");
  await expect(page.getByLabel("Link", { exact: true })).toHaveValue("strategy-session");
  await page.getByLabel("Duration (minutes)").fill("45");
  await page.getByLabel("Meeting link").fill("meet.example.com/x");
  await page.getByRole("button", { name: "Create meeting type" }).click();
  await expect(page.getByText("Paste the full meeting link, starting with https://")).toBeVisible();

  await page.getByLabel("Meeting link").fill("https://meet.example.com/x");
  await page.getByLabel("Buffer after").selectOption("15");
  await page.getByRole("button", { name: "+ Add a question" }).click();
  await page.getByLabel("Question 1", { exact: true }).fill("What would you like to cover?");
  await page.getByRole("button", { name: "Create meeting type" }).click();

  await expect(page).toHaveURL(/\/dashboard\/meeting-types$/);
  await expect(page.getByRole("heading", { name: "Strategy Session" })).toBeVisible();
  await expect(page.getByText("45 min · Video call")).toBeVisible();

  await page.goto(`/${username}`);
  await expect(page.getByRole("link", { name: /Strategy Session/ })).toBeVisible();
});
