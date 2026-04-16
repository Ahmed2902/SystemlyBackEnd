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
  code: string
) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(rateLimitHandler(message, code));
    },
  });

export const globalRateLimit = createLimiter(
  APP_CONFIG.rateLimit.globalWindowMs,
  APP_CONFIG.rateLimit.globalMax,
  "Too many requests. Please try again shortly.",
  "RATE_LIMITED"
);

export const authRateLimit = createLimiter(
  APP_CONFIG.rateLimit.authWindowMs,
  APP_CONFIG.rateLimit.authMax,
  "Too many authentication attempts. Please try again later.",
  "AUTH_RATE_LIMITED"
);

export const publicBookingRateLimit = createLimiter(
  APP_CONFIG.rateLimit.publicBookingWindowMs,
  APP_CONFIG.rateLimit.publicBookingMax,
  "Too many booking attempts. Please try again shortly.",
  "BOOKING_RATE_LIMITED"
);
