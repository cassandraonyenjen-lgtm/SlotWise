"use server";

import { after } from "next/server";
import { signOut } from "@/auth";
import { getDb } from "@/db";
import { getTransport } from "@/features/emails/transport";
import type { ActionResult } from "@/lib/action-result";
import { trackServer } from "@/lib/analytics";
import { log } from "@/lib/log";
import { requireUserId } from "@/lib/session";
import { deleteAccount } from "./account";

export async function deleteAccountAction(confirmation: unknown): Promise<ActionResult> {
  const userId = await requireUserId();
  if (confirmation !== "DELETE") {
    return {
      ok: false,
      error: "Type DELETE to confirm.",
      fieldErrors: { confirm: "Type DELETE to confirm." },
    };
  }
  const { cancelled } = await deleteAccount(getDb(), getTransport(), userId);
  log.info("account deleted", { cancelledBookings: cancelled });
  after(() => trackServer(userId, "account_deleted", { cancelledBookings: cancelled }));
  // The session row is gone with the user; this clears the cookie and leaves the dashboard.
  await signOut({ redirectTo: "/?deleted=1" });
  return { ok: true };
}
