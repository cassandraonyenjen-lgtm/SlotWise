import { scrubTokens } from "./scrub";

type Level = "info" | "warn" | "error";

/**
 * One JSON object per line, so the hosting platform's log search can filter by field
 * (PRD §8 Observability). Manage tokens are scrubbed from every line.
 */
function write(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  const { error, ...rest } = fields;
  const line = JSON.stringify({
    level,
    msg,
    time: new Date().toISOString(),
    ...rest,
    ...(error instanceof Error
      ? { error: { name: error.name, message: error.message, stack: error.stack } }
      : error !== undefined
        ? { error: String(error) }
        : {}),
  });
  const out = scrubTokens(line);
  if (level === "error") console.error(out);
  else if (level === "warn") console.warn(out);
  else console.info(out);
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};
