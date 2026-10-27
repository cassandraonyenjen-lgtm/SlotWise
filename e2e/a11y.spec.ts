import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createHost, daysFromNow, insertBooking, signIn } from "./helpers";

// Without motion, axe never samples a color mid-transition.
test.use({ reducedMotion: "reduce" });

/** WCAG 2.2 AA checks (PRD §8 Accessibility) on the pages people actually use. */
async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // FullCalendar's own markup is a third-party widget; we check our pages around it.
    .exclude(".fc")
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes.map((n) => `${n.target.join(" ")} ${n.html.slice(0, 120)} ${n.failureSummary ?? ""}`).join(", ")}`,
  );
  expect(summary).toEqual([]);
}

test("public pages are accessible", async ({ page }) => {
  const host = await createHost({
    username: true,
    everyDay: true,
    meetingType: { slug: "intro", name: "Intro call", requiredQuestion: "Company" },
  });
  for (const path of ["/", "/sign-in", "/privacy", `/${host.username}`]) {
    await page.goto(path);
    await expectNoViolations(page);
  }
  await page.goto(`/${host.username}/intro`);
  await expect(page.getByRole("group", { name: "Available times" })).toBeVisible();
  await expectNoViolations(page);
  await page.getByRole("group", { name: "Available times" }).getByRole("button").first().click();
  await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
  await expectNoViolations(page);
});

test("manage page is accessible", async ({ page }) => {
  const host = await createHost({
    username: true,
    everyDay: true,
    meetingType: { slug: "intro", name: "Intro call" },
  });
  const { token } = await insertBooking(host, daysFromNow(2));
  await page.goto(`/manage/${token}`);
  await expectNoViolations(page);
  await page.getByRole("button", { name: "Reschedule" }).click();
  await expect(page.getByRole("group", { name: "Available times" })).toBeVisible();
  await expectNoViolations(page);
});

test("dashboard pages are accessible", async ({ context, page }) => {
  const host = await createHost({
    username: true,
    everyDay: true,
    meetingType: { slug: "intro", name: "Intro call" },
  });
  await signIn(context, host.userId);
  const { bookingId } = await insertBooking(host, daysFromNow(1));
  for (const path of [
    "/dashboard",
    "/dashboard/availability",
    "/dashboard/meeting-types",
    "/dashboard/meeting-types/new",
    "/dashboard/settings",
  ]) {
    await page.goto(path);
    await expectNoViolations(page);
  }
  await page.goto(`/dashboard/calendar?booking=${bookingId}`);
  await expect(page.getByRole("complementary")).toBeVisible();
  await expectNoViolations(page);
});
