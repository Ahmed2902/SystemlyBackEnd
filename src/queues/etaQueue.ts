import { getWorkerUtils } from "./queue";

export const enqueueEtaJob = async (
  invoiceId: string,
  opts: { attempts?: number; delay?: number } = {},
) => {
  if (!invoiceId) throw new Error("enqueueEtaJob requires invoiceId");

  const utils = await getWorkerUtils();
  const jobOptions: Record<string, unknown> = {
    jobKey: `eta-receipt:${invoiceId}`,
    maxAttempts: opts.attempts ?? 5,
  };

  if (typeof opts.delay === "number") {
    jobOptions.runAt = new Date(Date.now() + opts.delay);
  }

  return utils.addJob("eta_receipt", { invoiceId }, jobOptions);
};

export const initEtaQueue = async () => {
  await getWorkerUtils();
  return { init: true };
};

export default { enqueueEtaJob, initEtaQueue };
