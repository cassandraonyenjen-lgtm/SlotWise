import { z } from "zod";

/**
 * Top-level paths the app owns, plus words that would confuse invitees. Public booking
 * pages live at /<username>, so none of these may ever be a username (F2.2).
 */
export const RESERVED_USERNAMES = new Set([
  "about",
  "account",
  "admin",
  "api",
  "app",
  "auth",
  "billing",
  "blog",
  "book",
  "booking",
  "bookings",
  "calendar",
  "contact",
  "dashboard",
  "docs",
  "help",
  "home",
  "login",
  "logout",
  "manage",
  "meeting-types",
  "new",
  "pricing",
  "privacy",
  "root",
  "settings",
  "sign-in",
  "sign-out",
  "signin",
  "signout",
  "signup",
  "slotwise",
  "static",
  "status",
  "support",
  "terms",
  "www",
  "_next",
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters")
  .max(32, "Use at most 32 characters")
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "Use lowercase letters, numbers and hyphens, not starting or ending with a hyphen",
  )
  .refine((u) => !RESERVED_USERNAMES.has(u), "That username is reserved");

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(username.toLowerCase());
}
