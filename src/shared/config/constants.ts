const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const parseOrigins = (value: string | undefined) => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

export const APP_CONFIG = {
  corsOrigins: parseOrigins(process.env.FRONTEND_URL),
  formBodyLimit: process.env.FORM_BODY_LIMIT || "1mb",
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || "1mb",
  port: parseNumber(process.env.PORT, 3000),
  rateLimit: {
    authMax: parseNumber(process.env.AUTH_RATE_LIMIT_MAX, 10),
    authWindowMs: parseNumber(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    globalMax: parseNumber(process.env.RATE_LIMIT_MAX, 300),
    globalWindowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    publicBookingMax: parseNumber(process.env.PUBLIC_BOOKING_RATE_LIMIT_MAX, 30),
    publicBookingWindowMs: parseNumber(
      process.env.PUBLIC_BOOKING_RATE_LIMIT_WINDOW_MS,
      10 * 60 * 1000
    ),
  },
} as const;
