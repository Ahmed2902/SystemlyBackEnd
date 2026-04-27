import rateLimit from "express-rate-limit";
import { APP_CONFIG } from "../config/config";
import { client as redisClient } from "../config/redis";

// Try to load Redis store for express-rate-limit. If not available, fall back to memory store.
// eslint-disable-next-line @typescript-eslint/no-var-requires
let RedisStore: any = null;
// Avoid using Redis-backed rate limiter during tests to prevent external Redis connections
if (process.env.NODE_ENV !== "test") {
  try {
    // rate-limit-redis supports ioredis v5 via a sendCommand wrapper
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    RedisStore = require("rate-limit-redis");
  } catch (err) {
    RedisStore = null;
  }
} else {
  RedisStore = null;
}

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
) => {
  const opts: any = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: any, res: any) => {
      res.status(429).json(rateLimitHandler(message, code));
    },
  };

  if (RedisStore && redisClient) {
    try {
      opts.store = new RedisStore({
        // ioredis v5 uses .call/sendCommand semantics; wrap with client.call
        sendCommand: (...args: any[]) => (redisClient as any).call(...args),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Rate limiter Redis store init failed, falling back to memory store", err);
    }
  }

  return rateLimit(opts);
};

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

// Use 10 per hour for public booking rate limiter as per plan
export const publicBookingRateLimit = createLimiter(
  60 * 60 * 1000,
  10,
  "Too many booking attempts. Please try again shortly.",
  "BOOKING_RATE_LIMITED"
);
