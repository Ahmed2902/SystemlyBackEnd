import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;

let client: any = null;

/**
 * Use real Redis only when REDIS_URL exists
 * Otherwise use in-memory fallback
 */
const isConfigured = Boolean(REDIS_URL) && process.env.NODE_ENV !== "test";

if (isConfigured) {
  client = new Redis(REDIS_URL as string, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  client.on("connect", () => {
    console.log("Redis connected");
  });

  client.on("error", (err: any) => {
    console.error("Redis error:", err.message);
  });
} else {
  console.warn("Redis not configured. Using in-memory fallback.");

  const store = new Map<string, string>();

  client = {
    get: async (key: string) => (store.has(key) ? store.get(key) : null),

    set: async (key: string, value: string, mode?: string, ttl?: number) => {
      store.set(key, value);

      if (mode === "EX" && ttl) {
        setTimeout(() => {
          store.delete(key);
        }, ttl * 1000);
      }

      return "OK";
    },

    del: async (key: string) => {
      return store.delete(key) ? 1 : 0;
    },

    call: async (..._args: any[]) => null,

    quit: async () => true,

    disconnect: () => true,

    on: () => {},
  };
}

export const get = async (key: string) => {
  return await client.get(key);
};

export const set = async (key: string, value: string, ttlSeconds?: number) => {
  if (ttlSeconds && ttlSeconds > 0) {
    await client.set(key, value, "EX", ttlSeconds);
  } else {
    await client.set(key, value);
  }
};

export const del = async (key: string) => {
  await client.del(key);
};

export { client };

export default {
  client,
  get,
  set,
  del,
};
