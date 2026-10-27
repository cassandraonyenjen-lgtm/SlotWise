import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { createHost, daysFromNow, getBooking, insertBooking, signIn } from "./helpers";

async function userExists(userId: string) {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const rows = await sql`select 1 from users where id = ${userId}`;
    return rows.length > 0;
  } finally {
    await sql.end();
  }
}

test("pages send security headers (PRD §8)", async ({ request }) => {
  const res = await request.get("/");
  const headers = res.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBeTruthy();
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("health check reports the database and email failure rate", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ ok: true, db: true });
  expect(typeof body.emailFailureRate).toBe("number");
});

test("email webhook stays closed without a signing secret", async ({ request }) => {
  const res = await request.post("/api/webhooks/resend", { data: { type: "email.delivered" } });
  expect(res.status()).toBe(404);
});

test("legal pages are linked from every page", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  for (const [link, heading] of [
    ["Privacy", "Privacy policy"],
    ["Terms", "Terms of service"],
    ["Cookies", "Cookie notice"],
  ] as const) {
    await footer.getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("host downloads their data, then deletes their account (PRD §8 Privacy)", async ({
  context,
  page,
}) => {
  const host = await createHost({
    username: true,
    everyDay: true,
    meetingType: { slug: "intro", name: "Intro call" },
  });
  const { bookingId } = await insertBooking(host, daysFromNow(3));
  await signIn(context, host.userId);
  await page.goto("/dashboard/settings");

  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download my data" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^slotwise-export-.*\.json$/);
  const data = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(data.account.id).toBe(host.userId);
  expect(data.bookings).toHaveLength(1);
  expect(JSON.stringify(data)).not.toContain("manageTokenHash");

  await page.getByRole("button", { name: "Delete my account" }).click();
  const confirm = page.getByRole("button", { name: "Delete account permanently" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await confirm.click();

  await expect(page.getByText("Your account and its data have been deleted.")).toBeVisible();
  expect(await userExists(host.userId)).toBe(false);
  expect(await getBooking(bookingId)).toBeUndefined();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});
