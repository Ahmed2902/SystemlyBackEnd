import "dotenv/config";

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
    authWindowMs: parseNumber(
      process.env.AUTH_RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000
    ),
    globalMax: parseNumber(process.env.RATE_LIMIT_MAX, 300),
    globalWindowMs: parseNumber(
      process.env.RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000
    ),
    publicBookingMax: parseNumber(
      process.env.PUBLIC_BOOKING_RATE_LIMIT_MAX,
      30
    ),
    publicBookingWindowMs: parseNumber(
      process.env.PUBLIC_BOOKING_RATE_LIMIT_WINDOW_MS,
      10 * 60 * 1000
    ),
  },
} as const;

export const DATABASE = {
  DATABASE_URL: process.env.DATABASE_URL,
};

export const EMAIL = {
  // Canonical sender address used by the app
  FROM_EMAIL:
    process.env.EMAIL_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    process.env.BREVO_FROM_EMAIL ||
    "noreply@hgezli.com",

  // SMTP configuration for Nodemailer
  SMTP_URL: process.env.EMAIL_SMTP_URL || process.env.SMTP_URL,
  SMTP_HOST: process.env.EMAIL_SMTP_HOST,
  SMTP_PORT: process.env.EMAIL_SMTP_PORT
    ? Number(process.env.EMAIL_SMTP_PORT)
    : undefined,
  SMTP_SECURE:
    process.env.EMAIL_SMTP_SECURE === "true" ||
    process.env.EMAIL_SMTP_SECURE === "1",
  SMTP_USER: process.env.EMAIL_SMTP_USER,
  SMTP_PASS: process.env.EMAIL_SMTP_PASS,
};

export const AUTH_CONSTANTS = {
  EMAIL_TOKEN_TTL_SECONDS: Number(process.env.EMAIL_TOKEN_TTL_SECONDS) || 86400, // 24 hours
  PWD_RESET_TTL_SECONDS: Number(process.env.PWD_RESET_TTL_SECONDS) || 3600, // 1 hour
  REFRESH_TOKEN_TTL_SECONDS:
    Number(process.env.REFRESH_TOKEN_TTL_SECONDS) || 30 * 24 * 60 * 60, // 30 days
};
