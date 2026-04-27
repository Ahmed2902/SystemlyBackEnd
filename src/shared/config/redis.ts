import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let client: any = null;
let isConfigured = Boolean(REDIS_URL) && process.env.NODE_ENV !== "test";

if (isConfigured) {
  client = new Redis(REDIS_URL as string);
  client.on("error", (err: any) => {
    if (process.env.NODE_ENV !== "test") {
      // eslint-disable-next-line no-console
      console.error("Redis error:", err);
    }
  });
} else {
  // Provide a lightweight in-memory stub to avoid hard failures in tests or environments without Redis
  const store = new Map<string, string>();
  client = {
    get: async (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    set: async (k: string, v: string, mode?: string, ttl?: number) => {
      // support set(key, value) and set(key, value, 'EX', ttl)
      store.set(k, v);
      return "OK";
    },
    del: async (k: string) => {
      return store.delete(k) ? 1 : 0;
    },
    call: async (..._args: any[]) => {
      // no-op for rate-limit-redis compatibility
      return null;
    },
    on: () => {},
  } as any;
}

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

export { client };

export default { get, set, del };
