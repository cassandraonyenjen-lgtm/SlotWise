/** Postgres SQLSTATE for exclusion_violation. */
const EXCLUSION_VIOLATION = "23P01";

/**
 * True when an insert/update lost the race for a slot to another booking
 * (the `bookings_no_overlap` constraint fired).
 */
export function isSlotTakenError(error: unknown): boolean {
  for (let e: unknown = error; e && typeof e === "object"; e = (e as { cause?: unknown }).cause) {
    const { code, constraint_name } = e as { code?: string; constraint_name?: string };
    if (code === EXCLUSION_VIOLATION && constraint_name === "bookings_no_overlap") return true;
  }
  return false;
}
