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
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Enter the name clients should see.")).toBeVisible();

  await name.fill("Jane at Acme");
  await reminders.selectOption({ label: "24 hours and 1 hour before" });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

  await page.reload();
  await expect(name).toHaveValue("Jane at Acme");
  await expect(reminders).toHaveValue("both");
});
