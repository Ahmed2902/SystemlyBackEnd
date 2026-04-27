import IORedis from "ioredis";
import { Queue, QueueScheduler } from "bullmq";

const REDIS_URL = process.env.REDIS_URL || undefined;

let connection: any = null;
let scheduler: any = null;
let emailQueue: any = null;

/**
 * Determine whether a BullMQ error is the well-known Upstash incompatibility
 * error. BullMQ throws this both synchronously (during construction) and
 * asynchronously (via error events) when it detects an Upstash endpoint.
 */
function isUpstashError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.toLowerCase().includes("upstash")
  );
}

if (REDIS_URL && process.env.NODE_ENV !== "test") {
  try {
    connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // BullMQ detects Upstash and throws synchronously during instantiation.
    // Wrap each constructor call individually so we can surface a precise
    // error message rather than a generic Redis failure.
    try {
      // Ensure a scheduler exists for delayed/retry jobs
      scheduler = new QueueScheduler("emailQueue", { connection });

      // Attach an async error listener so that if BullMQ raises the Upstash
      // error via an event (rather than synchronously) the process doesn't
      // crash and we fall back to the no-op stub.
      scheduler.on("error", (err: unknown) => {
        if (isUpstashError(err)) {
          console.warn(
            "[EmailQueue] QueueScheduler: Upstash Redis is not compatible with BullMQ. " +
            "Switch to Redis Cloud (or another BullMQ-compatible Redis) to enable the queue. " +
            "Falling back to no-op stub."
          );
        } else {
          console.error("[EmailQueue] QueueScheduler error:", err);
        }
        scheduler = { waitUntilReady: async () => {} } as any;
      });
    } catch (err) {
      if (isUpstashError(err)) {
        console.warn(
          "[EmailQueue] QueueScheduler: Upstash Redis is not compatible with BullMQ. " +
          "Switch to Redis Cloud (or another BullMQ-compatible Redis) to enable the queue. " +
          "Falling back to no-op stub."
        );
      } else {
        console.warn("[EmailQueue] QueueScheduler failed to initialize:", err);
      }
      scheduler = null;
    }

    try {
      emailQueue = new Queue("emailQueue", { connection });

      // Same async safety net for the Queue instance.
      emailQueue.on("error", (err: unknown) => {
        if (isUpstashError(err)) {
          console.warn(
            "[EmailQueue] Queue: Upstash Redis is not compatible with BullMQ. " +
            "Switch to Redis Cloud (or another BullMQ-compatible Redis) to enable the queue. " +
            "Falling back to no-op stub."
          );
        } else {
          console.error("[EmailQueue] Queue error:", err);
        }
        emailQueue = { add: async () => ({}) } as any;
      });
    } catch (err) {
      if (isUpstashError(err)) {
        console.warn(
          "[EmailQueue] Queue: Upstash Redis is not compatible with BullMQ. " +
          "Switch to Redis Cloud (or another BullMQ-compatible Redis) to enable the queue. " +
          "Falling back to no-op stub."
        );
      } else {
        console.warn("[EmailQueue] Queue failed to initialize:", err);
      }
      emailQueue = null;
    }
  } catch (err) {
    // IORedis constructor itself failed (bad URL, etc.)
    console.warn("[EmailQueue] Redis connection failed, falling back to no-op stub:", err);
  }
}

// In test mode, when Redis is not configured, or when BullMQ initialization
// failed for any reason (including Upstash incompatibility), provide no-op
// stubs so the rest of the app continues to function without a queue.
if (!scheduler) {
  scheduler = { waitUntilReady: async () => {} } as any;
}
if (!emailQueue) {
  emailQueue = {
    add: async () => ({}),
  } as any;
}

export const enqueueEmailJob = async (
  name: string,
  data: Record<string, any>,
  opts: Record<string, any> = {}
) => {
  return emailQueue.add(name, data, {
    attempts: opts.attempts ?? 3,
    backoff: opts.backoff ?? { type: "exponential", delay: 60 * 1000 },
    removeOnComplete: opts.removeOnComplete ?? true,
    removeOnFail: opts.removeOnFail ?? false,
    delay: opts.delay ?? 0,
  });
};

export const initEmailQueue = async () => {
  await scheduler.waitUntilReady();
  return { scheduler, queue: emailQueue };
};

export default { emailQueue, enqueueEmailJob, initEmailQueue };
