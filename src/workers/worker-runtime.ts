import type { TaskList } from "graphile-worker";

export type WorkerRunOptions = {
  connectionString: string;
  concurrency: number;
  taskList: TaskList;
};

export type RunJobsOnce = (options: WorkerRunOptions) => Promise<void>;

export type WorkerLogger = {
  info(message: string, metadata?: unknown): void;
  error(message: string, error?: unknown): void;
};

export type CloseableWorkerResource = {
  name: string;
  close(): Promise<void> | void;
};

export type OneShotWorkerDependencies = {
  runJobsOnce: RunJobsOnce;
  taskList: TaskList;
  resources: readonly CloseableWorkerResource[];
  env?: NodeJS.ProcessEnv;
  logger?: WorkerLogger;
};

export function resolveWorkerConnectionString(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const connectionString = env.DATABASE_URL || env.DATABASE_URL_LOCAL;
  if (!connectionString) {
    throw new Error(
      "Graphile Worker requires DATABASE_URL or DATABASE_URL_LOCAL",
    );
  }
  return connectionString;
}

export function resolveWorkerConcurrency(
  env: NodeJS.ProcessEnv = process.env,
  fallback = 3,
): number {
  const parsed = Number(env.WORKER_CONCURRENCY);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

async function closeResources(
  resources: readonly CloseableWorkerResource[],
  logger: WorkerLogger,
): Promise<unknown[]> {
  const errors: unknown[] = [];

  for (const resource of resources) {
    try {
      await resource.close();
    } catch (error) {
      errors.push(error);
      logger.error(`[WorkerOnce] Failed to close ${resource.name}`, error);
    }
  }

  return errors;
}

/**
 * Drains all currently runnable Graphile Worker jobs and then releases every
 * process-level resource. Dependencies are injected so orchestration remains
 * independent from concrete database, cache, and queue implementations.
 */
export async function runOneShotWorker({
  runJobsOnce,
  taskList,
  resources,
  env = process.env,
  logger = console,
}: OneShotWorkerDependencies): Promise<void> {
  const options: WorkerRunOptions = {
    connectionString: resolveWorkerConnectionString(env),
    concurrency: resolveWorkerConcurrency(env),
    taskList,
  };

  let runError: unknown;

  logger.info("[WorkerOnce] Draining runnable jobs", {
    concurrency: options.concurrency,
    tasks: Object.keys(taskList),
  });

  try {
    await runJobsOnce(options);
    logger.info("[WorkerOnce] Queue drained");
  } catch (error) {
    runError = error;
    logger.error("[WorkerOnce] Job execution failed", error);
  }

  const cleanupErrors = await closeResources(resources, logger);

  if (runError) throw runError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      cleanupErrors,
      "One-shot worker completed but resource cleanup failed",
    );
  }
}
