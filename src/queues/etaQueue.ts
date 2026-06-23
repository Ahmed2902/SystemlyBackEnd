import { makeWorkerUtils, WorkerUtils } from "graphile-worker";

let workerUtils: WorkerUtils | null = null;

async function getWorkerUtils() {
  if (!workerUtils) {
    workerUtils = await makeWorkerUtils({
      connectionString:
        process.env.DATABASE_URL || process.env.DATABASE_URL_LOCAL!,
    });
  }

  return workerUtils;
}

export const enqueueEtaJob = async (
  invoiceId: string,
  opts: Record<string, any> = {},
) => {
  const utils = await getWorkerUtils();

  const jobOptions: any = {};

  if (opts.attempts) {
    jobOptions.maxAttempts = opts.attempts;
  }

  if (typeof opts.delay === "number") {
    jobOptions.runAt = new Date(Date.now() + opts.delay);
  }

  return utils.addJob("eta_receipt", { invoiceId }, jobOptions);
};

export const initEtaQueue = async () => {
  await getWorkerUtils(); // warm up connection pool
  return { init: true };
};

export default { enqueueEtaJob, initEtaQueue };
