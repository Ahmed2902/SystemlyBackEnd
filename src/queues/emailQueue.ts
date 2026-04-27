import IORedis from "ioredis";
import { Queue, QueueScheduler } from "bullmq";

const REDIS_URL = process.env.REDIS_URL || undefined;

let connection: any = null;
let scheduler: any = null;
let emailQueue: any = null;

if (REDIS_URL && process.env.NODE_ENV !== "test") {
  try {
    connection = new IORedis(REDIS_URL);
    // Ensure a scheduler exists for delayed/retry jobs
    scheduler = new QueueScheduler("emailQueue", { connection });
    emailQueue = new Queue("emailQueue", { connection });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[EmailQueue] Redis unavailable, falling back to in-memory stub", err);
  }
}

// In test or when Redis not configured, provide no-op stubs so imports don't crash
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
