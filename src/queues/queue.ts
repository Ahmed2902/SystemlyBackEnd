import { makeWorkerUtils, WorkerUtils } from "graphile-worker";

let workerUtils: WorkerUtils | null = null;
let workerUtilsPromise: Promise<WorkerUtils> | null = null;

function getConnectionString() {
  const connectionString =
    process.env.DATABASE_URL || process.env.DATABASE_URL_LOCAL;
  if (!connectionString) {
    throw new Error(
      "Graphile Worker requires DATABASE_URL or DATABASE_URL_LOCAL",
    );
  }
  return connectionString;
}

/**
 * Returns one shared WorkerUtils instance for API-side job producers.
 * Concurrent first calls reuse the same initialization promise so they do not
 * create multiple PostgreSQL pools during traffic spikes.
 */
export async function getWorkerUtils(): Promise<WorkerUtils> {
  if (process.env.NODE_ENV === "test") {
    return {
      addJob: async (name: string, payload: unknown, _opts?: unknown) => {
        console.log(
          `[MockQueue] Job "${name}" enqueued with payload:`,
          payload,
        );
        return { id: "mock-job-id" };
      },
    } as unknown as WorkerUtils;
  }

  if (workerUtils) return workerUtils;

  if (!workerUtilsPromise) {
    workerUtilsPromise = makeWorkerUtils({
      connectionString: getConnectionString(),
    })
      .then((utils) => {
        workerUtils = utils;
        return utils;
      })
      .catch((error) => {
        workerUtilsPromise = null;
        throw error;
      });
  }

  return workerUtilsPromise;
}

export async function closeWorkerUtils() {
  const current = workerUtils;
  workerUtils = null;
  workerUtilsPromise = null;
  if (current) await current.release();
}

export const enqueueJob = async (
  name: string,
  payload: unknown,
  opts: Record<string, unknown> = {},
) => {
  const utils = await getWorkerUtils();
  return utils.addJob(name, payload, opts);
};

export default { getWorkerUtils, closeWorkerUtils, enqueueJob };
