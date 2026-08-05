type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

const REDACTED_KEYS = new Set([
  "authorization",
  "cookie",
  "password",
  "passwordHash",
  "refreshToken",
  "resetToken",
  "token",
  "verificationToken",
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      REDACTED_KEYS.has(key) ? "[REDACTED]" : sanitize(entry),
    ]),
  );
}

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  if (process.env.NODE_ENV === "test") return;

  const line = JSON.stringify(
    sanitize({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...fields,
    }),
  );

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};

export default logger;
