import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const client = new Redis(REDIS_URL);

client.on("error", (err) => {
  // do not crash the app for redis errors; log for visibility
  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.error("Redis error:", err);
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
