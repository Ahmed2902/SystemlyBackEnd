import "./env";
import { environment } from "./environment";

const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBool = (value: string | undefined, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  return ["true", "1", "yes"].includes(value.toLowerCase().trim());
};

const parseOrigins = (value: string | undefined) => {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map((origin) => new URL(origin).origin),
    ),
  );
};

export const APP_CONFIG = {
  nodeEnv: environment.NODE_ENV,
  isDevelopment: environment.NODE_ENV === "development",
  isProduction: environment.NODE_ENV === "production",
  isTest: environment.NODE_ENV === "test",
  port: parseNumber(process.env.PORT, 3000),
  corsOrigins: parseOrigins(
    [environment.FRONTEND_URL, process.env.CORS_ORIGINS]
      .filter(Boolean)
      .join(","),
  ),
  formBodyLimit: process.env.FORM_BODY_LIMIT || "1mb",
  jsonBodyLimit: process.env.JSON_BODY_LIMIT || "1mb",
  rateLimit: {
    authMax: parseNumber(process.env.AUTH_RATE_LIMIT_MAX, 10),
    authWindowMs: parseNumber(
      process.env.AUTH_RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000,
    ),
    globalMax: parseNumber(process.env.RATE_LIMIT_MAX, 300),
    globalWindowMs: parseNumber(
      process.env.RATE_LIMIT_WINDOW_MS,
      15 * 60 * 1000,
    ),
    publicBookingMax: parseNumber(
      process.env.PUBLIC_BOOKING_RATE_LIMIT_MAX,
      30,
    ),
    publicBookingWindowMs: parseNumber(
      process.env.PUBLIC_BOOKING_RATE_LIMIT_WINDOW_MS,
      10 * 60 * 1000,
    ),
  },
} as const;

export const FRONTEND_URL =
  environment.FRONTEND_URL || "http://localhost:3000";
export const APP_URL = environment.APP_URL || "http://localhost:3000";

export const DATABASE = {
  DATABASE_URL: environment.DATABASE_URL,
} as const;

export const REDIS = {
  URL: environment.REDIS_URL,
  CONNECT_TIMEOUT_MS: parseNumber(process.env.REDIS_CONNECT_TIMEOUT_MS, 2_000),
  COMMAND_TIMEOUT_MS: parseNumber(process.env.REDIS_COMMAND_TIMEOUT_MS, 1_500),
  MAX_RETRIES_PER_REQUEST: parseNumber(
    process.env.REDIS_MAX_RETRIES_PER_REQUEST,
    1,
  ),
} as const;

export const EMAIL = {
  FROM_EMAIL: environment.EMAIL_FROM || "Systemly <onboarding@resend.dev>",
  RESEND_API_KEY: environment.RESEND_API_KEY || "",
} as const;

export const AUTH_CONSTANTS = {
  EMAIL_TOKEN_TTL_SECONDS: parseNumber(
    process.env.EMAIL_TOKEN_TTL_SECONDS,
    86_400,
  ),
  PWD_RESET_TTL_SECONDS: parseNumber(
    process.env.PWD_RESET_TTL_SECONDS,
    3_600,
  ),
  REFRESH_TOKEN_TTL_SECONDS: parseNumber(
    process.env.REFRESH_TOKEN_TTL_SECONDS,
    30 * 24 * 60 * 60,
  ),
  TRIAL_DAYS_DEFAULT: parseNumber(process.env.TRIAL_DAYS_DEFAULT, 14),
} as const;

export const JWT = {
  SECRET: environment.JWT_SECRET || "ci-development-access-secret",
  REFRESH_SECRET:
    environment.JWT_REFRESH_SECRET || "ci-development-refresh-secret",
  EXPIRES_IN: process.env.JWT_EXPIRES_IN || "15m",
  REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  ISSUER: process.env.JWT_ISSUER || "systemly-api",
  AUDIENCE: process.env.JWT_AUDIENCE || "systemly-web",
} as const;

export const SENTRY = {
  DSN: environment.SENTRY_DSN || "",
  ENV: process.env.SENTRY_ENV || environment.NODE_ENV,
  RELEASE: process.env.SENTRY_RELEASE || undefined,
  ENABLED: Boolean(environment.SENTRY_DSN),
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
  ENABLE_METRICS,
} as const;

export default config;
