import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const isProduction = process.env.NODE_ENV === "production";

// In production, cap retries so a missing Redis service causes a fast, visible
// failure rather than an indefinite hang that swallows all log output.
const client = new Redis(REDIS_URL, {
  // Retry up to 5 times with a 500 ms delay, then stop retrying.
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (isProduction && times > 5) {
      console.error(
        `[redis] Could not connect after ${times} attempts — giving up. ` +
          "Ensure REDIS_URL is set correctly in your environment."
      );
      // Returning null tells ioredis to stop retrying.
      return null;
    }
    // Exponential back-off capped at 2 s.
    return Math.min(times * 200, 2000);
  },
  enableOfflineQueue: false,
  lazyConnect: false,
});

client.on("connect", () => {
  console.log("[redis] Connected successfully.");
});

client.on("ready", () => {
  console.log("[redis] Client ready.");
});

client.on("error", (err) => {
  // do not crash the app for redis errors; log for visibility
  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.error("[redis] Error:", err.message ?? err);
  }
});

client.on("close", () => {
  if (process.env.NODE_ENV !== "test") {
    console.warn("[redis] Connection closed.");
  }
});

client.on("reconnecting", (delay: number) => {
  if (process.env.NODE_ENV !== "test") {
    console.warn(`[redis] Reconnecting in ${delay}ms...`);
  }
});

export const get = async (key: string) => {
  const val = await client.get(key);
  return val;
};

export const set = async (key: string, value: string, ttlSeconds?: number) => {
  if (ttlSeconds && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
    await client.set(key, value, "EX", ttlSeconds);
  } else {
    await client.set(key, value);
  }
};

export const del = async (key: string) => {
  await client.del(key);
};

export default { get, set, del };
