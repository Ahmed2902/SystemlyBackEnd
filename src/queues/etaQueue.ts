import IORedis from "ioredis";
import { Queue, QueueScheduler } from "bullmq";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const connection = new IORedis(REDIS_URL);

const scheduler = new QueueScheduler("etaReceiptQueue", { connection });

export const etaQueue = new Queue("etaReceiptQueue", { connection });

export const enqueueEtaJob = async (
  invoiceId: string,
  opts: Record<string, any> = {},
) => {
  return etaQueue.add(
    "eta_receipt",
    { invoiceId },
    {
      attempts: opts.attempts ?? 5,
      backoff: opts.backoff ?? { type: "exponential", delay: 60 * 1000 },
      removeOnComplete: opts.removeOnComplete ?? true,
      removeOnFail: opts.removeOnFail ?? false,
      delay: opts.delay ?? 0,
    },
  );
};

export const initEtaQueue = async () => {
  await scheduler.waitUntilReady();
  return { scheduler, queue: etaQueue };
};

export default { etaQueue, enqueueEtaJob, initEtaQueue };
