import { makeWorkerUtils, WorkerUtils } from "graphile-worker";

let workerUtils: WorkerUtils | null = null;

/**
 * Returns a shared instance of WorkerUtils.
 * In a test environment, it returns a stub mock to prevent database connection hangs and keep tests fast.
 */
export async function getWorkerUtils(): Promise<WorkerUtils> {
  if (process.env.NODE_ENV === "test") {
    return {
      addJob: async (name: string, payload: any, _opts?: any) => {
        // eslint-disable-next-line no-console
        console.log(
          `[MockQueue] Job "${name}" enqueued with payload:`,
          payload,
        );
        return { id: "mock-job-id" };
      },
    } as unknown as WorkerUtils;
  }

  if (!workerUtils) {
    const connectionString =
      process.env.DATABASE_URL || process.env.DATABASE_URL_LOCAL!;
    workerUtils = await makeWorkerUtils({
      connectionString,
    });
  }

  return workerUtils;
}

/**
 * Helper to enqueue a generic job directly.
 */
export const enqueueJob = async (
  name: string,
  payload: any,
  opts: Record<string, any> = {},
) => {
  const utils = await getWorkerUtils();
  return utils.addJob(name, payload, opts);
};

export default { getWorkerUtils, enqueueJob };
