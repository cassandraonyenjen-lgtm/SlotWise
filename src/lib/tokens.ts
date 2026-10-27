import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Manage-link tokens (F5.5, PRD §7 decision 4).
 *
 * A booking's token is HMAC-SHA256(secret, booking id): 256 bits, unguessable without the
 * server secret, and scoped to one booking. Only its SHA-256 hash is stored, so a database
 * leak can't be turned into working cancel/reschedule links. Deriving it (rather than storing
 * a random value) lets background jobs rebuild the link for reminders without the raw token
 * ever passing through the job queue. Rotating the secret invalidates existing links.
 */
export function manageTokenFor(bookingId: string, secret = manageSecret()): string {
  return createHmac("sha256", secret).update(`manage:${bookingId}`).digest("base64url");
}

export function hashManageToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Random 256-bit token, for tests and one-off fixtures that don't need a derivable link. */
export function generateManageToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashManageToken(token) };
}

function manageSecret(): string {
  const secret = process.env.MANAGE_LINK_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error("Set AUTH_SECRET (or MANAGE_LINK_SECRET) to create manage links");
  return secret;
}
