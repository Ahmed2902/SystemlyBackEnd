import rateLimit from "express-rate-limit";
import { APP_CONFIG } from "../config/config";

const rateLimitHandler = (message: string, code: string) => ({
  code,
  error: message,
  success: false,
});

const createLimiter = (
  windowMs: number,
  max: number,
  message: string,
  code: string,
  options: { skipSuccessfulRequests?: boolean } = {},
) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests,
    handler: (_req, res) => {
      res.status(429).json(rateLimitHandler(message, code));
    },
  });

export const globalRateLimit = createLimiter(
  APP_CONFIG.rateLimit.globalWindowMs,
  APP_CONFIG.rateLimit.globalMax,
  "Too many requests. Please try again shortly.",
  "RATE_LIMITED",
);

// Only failed login/register attempts consume this budget. Successful auth
// should not lock a user out of unrelated authentication operations.
export const authRateLimit = createLimiter(
  APP_CONFIG.rateLimit.authWindowMs,
  APP_CONFIG.rateLimit.authMax,
  "Too many authentication attempts. Please try again later.",
  "AUTH_RATE_LIMITED",
  { skipSuccessfulRequests: true },
);

// Email-triggering endpoints intentionally count successful requests as well.
// The service adds a per-account cooldown; this limiter caps anonymous/IP abuse.
export const emailActionRateLimit = createLimiter(
  APP_CONFIG.rateLimit.authWindowMs,
  Math.max(APP_CONFIG.rateLimit.authMax, 10),
  "Too many email requests. Please try again later.",
  "EMAIL_RATE_LIMITED",
);

// Refresh traffic is operational session maintenance, not a login attempt.
// It has a separate failed-request budget so a stale browser cannot block login.
export const refreshRateLimit = createLimiter(
  APP_CONFIG.rateLimit.authWindowMs,
  Math.max(APP_CONFIG.rateLimit.authMax * 3, 30),
  "Too many failed session refresh attempts. Please sign in again.",
  "REFRESH_RATE_LIMITED",
  { skipSuccessfulRequests: true },
);

export const publicBookingRateLimit = createLimiter(
  APP_CONFIG.rateLimit.publicBookingWindowMs,
  APP_CONFIG.rateLimit.publicBookingMax,
  "Too many booking attempts. Please try again shortly.",
  "BOOKING_RATE_LIMITED",
);
