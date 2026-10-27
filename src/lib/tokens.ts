import { createHash, randomBytes } from "node:crypto";

/**
 * Manage-link tokens (F5.5, PRD §7 decision 4).
 * 32 random bytes = 256 bits (PRD floor is 128). Only the SHA-256 hash is stored, so a
 * database leak can't be turned into working cancel/reschedule links.
 */
export function generateManageToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashManageToken(token) };
}

export function hashManageToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
