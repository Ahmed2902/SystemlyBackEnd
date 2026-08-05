import Redis from "ioredis";
import { REDIS } from "./config";
import { Errors } from "../errors/application-error";
import logger from "../observability/logger";

let client: Redis | null = null;
let connecting: Promise<Redis> | null = null;
const testStore = new Map<string, { value: string; expiresAt?: number }>();

function configuredUrl(): string {
  if (!REDIS.URL) {
    throw Errors.serviceUnavailable(
      "Redis is not configured for this environment.",
      "REDIS_NOT_CONFIGURED",
    );
  }
  return REDIS.URL;
}

async function getClient(): Promise<Redis> {
  if (client?.status === "ready") return client;
  if (connecting) return connecting;

  const instance =
    client ??
    new Redis(configuredUrl(), {
      lazyConnect: true,
      enableOfflineQueue: false,
      connectTimeout: REDIS.CONNECT_TIMEOUT_MS,
      commandTimeout: REDIS.COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: REDIS.MAX_RETRIES_PER_REQUEST,
      retryStrategy(attempt) {
        if (attempt > 3) return null;
        return Math.min(attempt * 250, 1_000);
      },
    });

  instance.on("error", (error) => {
    logger.warn("redis_error", { message: error.message });
  });
  instance.on("reconnecting", () => logger.warn("redis_reconnecting"));

  client = instance;
  connecting = (async () => {
    if (instance.status === "wait" || instance.status === "end") {
      await instance.connect();
    }
    return instance;
  })()
    .catch((error) => {
      client = null;
      throw Errors.serviceUnavailable(
        "Redis is temporarily unavailable.",
        "REDIS_UNAVAILABLE",
        error,
      );
    })
    .finally(() => {
      connecting = null;
    });

  return connecting;
}

function readTestValue(key: string): string | null {
  const entry = testStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    testStore.delete(key);
    return null;
  }
  return entry.value;
}

export async function get(key: string): Promise<string | null> {
  if (process.env.NODE_ENV === "test") return readTestValue(key);
  return (await getClient()).get(key);
}

export async function set(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    testStore.set(key, {
      value,
      ...(ttlSeconds && ttlSeconds > 0
        ? { expiresAt: Date.now() + ttlSeconds * 1_000 }
        : {}),
    });
    return;
  }

  const redis = await getClient();
  if (ttlSeconds && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
    await redis.set(key, value, "EX", ttlSeconds);
  } else {
    await redis.set(key, value);
  }
}

export async function del(key: string): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    testStore.delete(key);
    return;
  }
  await (await getClient()).del(key);
}

export async function increment(key: string): Promise<number> {
  if (process.env.NODE_ENV === "test") {
    const value = Number(readTestValue(key) ?? "0") + 1;
    testStore.set(key, { value: String(value) });
    return value;
  }
  return (await getClient()).incr(key);
}

export async function disconnect(): Promise<void> {
  testStore.clear();
  const current = client;
  client = null;
  connecting = null;
  if (!current || current.status === "end") return;
  await current.quit().catch(() => current.disconnect(false));
}

export function isConfigured(): boolean {
  return Boolean(REDIS.URL) || process.env.NODE_ENV === "test";
}

export default { get, set, del, increment, disconnect, isConfigured };
