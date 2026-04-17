import IORedis from "ioredis";
import { Queue, QueueScheduler } from "bullmq";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const connection = new IORedis(REDIS_URL);

// Ensure a scheduler exists for delayed/retry jobs
const scheduler = new QueueScheduler("emailQueue", { connection });

export const emailQueue = new Queue("emailQueue", { connection });

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
  // touch scheduler to initialize
  await scheduler.waitUntilReady();
  return { scheduler, queue: emailQueue };
};

export default { emailQueue, enqueueEmailJob, initEmailQueue };
