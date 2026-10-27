import { expect, test } from "@playwright/test";
import { signInAsNewHost } from "./helpers";

test("host sets the name on their emails and when reminders go out (F4.3)", async ({
  context,
  page,
}) => {
  await signInAsNewHost(context);
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

  const name = page.getByLabel("Your name");
  const reminders = page.getByLabel("Reminders");
  await expect(reminders).toHaveValue("24h");

  await name.fill("");
  await page.getByRole("button", { name: "Save email settings" }).click();
  await expect(page.getByText("Enter the name clients should see.")).toBeVisible();

  await name.fill("Jane at Acme");
  await reminders.selectOption({ label: "24 hours and 1 hour before" });
  await page.getByRole("button", { name: "Save email settings" }).click();
  await expect(page.getByRole("status").first()).toHaveText("Saved.");

  await page.reload();
  await expect(name).toHaveValue("Jane at Acme");
  await expect(reminders).toHaveValue("both");
});

test("host sets how close to a meeting clients can still change it (F5.4)", async ({
  context,
  page,
}) => {
  await signInAsNewHost(context);
  await page.goto("/dashboard/settings");
  const cutoff = page.getByLabel("Clients can make changes");
  await expect(cutoff).toHaveValue("0");
  await cutoff.selectOption({ label: "Up to 24 hours before" });
  await page.getByRole("button", { name: "Save cutoff" }).click();
  await expect(page.getByRole("status").nth(1)).toHaveText("Saved.");
  await page.reload();
  await expect(cutoff).toHaveValue("1440");
});
