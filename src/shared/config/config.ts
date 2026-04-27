import "./env";

const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const parseBool = (value: string | undefined, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  const v = String(value).toLowerCase().trim();
  return v === "true" || v === "1" || v === "yes";
};

const parseOrigins = (value: string | undefined) => {
  if (!value) return [];
  return value
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
};

const resolveDatabaseUrl = () => {
  const url =
    process.env.DOCKER_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.PRISMA_DATABASE_URL ||
    (process.env.NODE_ENV === "production"
      ? process.env.SUPABASE_TRANSACTION_POOLER
      : process.env.SUPABASE_CONNECTION_STRING) ||
    process.env.SUPABASE_TRANSACTION_POOLER ||
    process.env.SUPABASE_CONNECTION_STRING;

  if (!url) {
    throw new Error(
      "Missing database connection string. Set DATABASE_URL in .env."
    );
  }

  return url;
};

export const APP_CONFIG = {
  nodeEnv:
    (process.env.NODE_ENV as "development" | "production" | "test") ||
    "development",
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  port: parseNumber(process.env.PORT, 3000),
  corsOrigins: parseOrigins(
    process.env.CORS_ORIGINS || process.env.FRONTEND_URL
  ),
  formBodyLimit: process.env.FORM_BODY_LIMIT || "1mb",
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || "1mb",
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
      10
    ),
    publicBookingWindowMs: parseNumber(
      process.env.PUBLIC_BOOKING_RATE_LIMIT_WINDOW_MS,
      60 * 60 * 1000
    ),
  },
} as const;

export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

export const APP_URL = process.env.APP_URL || "http://localhost:3000";

export const DATABASE = {
  DATABASE_URL: resolveDatabaseUrl(),
} as const;

export const REDIS = {
  URL: process.env.REDIS_URL,
  HOST: process.env.REDIS_HOST || "localhost",
  PORT: parseNumber(process.env.REDIS_PORT, 6379),
  PASSWORD: process.env.REDIS_PASSWORD || undefined,
  DB: parseNumber(process.env.REDIS_DB, 0),
} as const;

export const EMAIL = {
  FROM_EMAIL:
    process.env.EMAIL_FROM ||
    process.env.RESEND_FROM_EMAIL ||
    process.env.BREVO_FROM_EMAIL ||
    "ahmedabdelrahma@gmail.com",
  SMTP_URL: process.env.EMAIL_SMTP_URL || process.env.SMTP_URL,
  SMTP_HOST: process.env.EMAIL_SMTP_HOST || "localhost",
  SMTP_PORT: process.env.EMAIL_SMTP_PORT
    ? Number(process.env.EMAIL_SMTP_PORT)
    : 587,
  SMTP_SECURE: parseBool(process.env.EMAIL_SMTP_SECURE, false),
  SMTP_USER: process.env.EMAIL_SMTP_USER || "",
  SMTP_PASS: process.env.EMAIL_SMTP_PASS || "",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  BREVO_API_KEY: process.env.BREVO_API_KEY || "",
} as const;

export const AUTH_CONSTANTS = {
  EMAIL_TOKEN_TTL_SECONDS: parseNumber(
    process.env.EMAIL_TOKEN_TTL_SECONDS,
    86400
  ),
  PWD_RESET_TTL_SECONDS: parseNumber(process.env.PWD_RESET_TTL_SECONDS, 3600),
  REFRESH_TOKEN_TTL_SECONDS: parseNumber(
    process.env.REFRESH_TOKEN_TTL_SECONDS,
    30 * 24 * 60 * 60
  ),
  TRIAL_DAYS_DEFAULT: parseNumber(process.env.TRIAL_DAYS_DEFAULT, 14),
} as const;

export const JWT = {
  SECRET: process.env.JWT_SECRET || "dev-jwt-secret-change-me",
  REFRESH_SECRET:
    process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me",
  EXPIRES_IN: process.env.JWT_EXPIRES_IN || "15m",
  REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
} as const;

export const SENTRY = {
  DSN: process.env.SENTRY_DSN || "",
  ENV: process.env.SENTRY_ENV || process.env.NODE_ENV || "production",
  RELEASE: process.env.SENTRY_RELEASE || undefined,
  ENABLED: parseBool(process.env.SENTRY_DSN, false),
} as const;

export const PAYMOB = {
  API_KEY: process.env.PAYMOB_API_KEY || "",
  MERCHANT_ID: process.env.PAYMOB_MERCHANT_ID || "",
  INTEGRATION_ID: process.env.PAYMOB_INTEGRATION_ID || "",
  HMAC_SECRET: process.env.PAYMOB_HMAC_SECRET || process.env.PAYMOB_HMAC || "",
  BASE_URL:
    process.env.PAYMOB_BASE_URL || "https://accept.paymobsolutions.com/api",
  ENABLED: !!process.env.PAYMOB_API_KEY,
} as const;

export const ENABLE_METRICS = parseBool(process.env.ENABLE_METRICS, false);

export const config = {
  APP_CONFIG,
  FRONTEND_URL,
  APP_URL,
  DATABASE,
  REDIS,
  EMAIL,
  AUTH_CONSTANTS,
  JWT,
  SENTRY,
  PAYMOB,
  ENABLE_METRICS,
} as const;

export default config;
