import type { z } from "zod";

/** What every server action returns to its form. */
export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string; fieldErrors?: FieldErrors };

/** Issue messages keyed by their dotted path, e.g. "days.1.0.start". */
export type FieldErrors = Record<string, string>;

export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
  return fieldErrors;
}

export function invalid(error: z.ZodError): { ok: false; error: string; fieldErrors: FieldErrors } {
  return {
    ok: false,
    error: error.issues[0]?.message ?? "Check the highlighted fields",
    fieldErrors: fieldErrorsOf(error),
  };
}
