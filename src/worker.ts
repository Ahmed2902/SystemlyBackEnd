import "./shared/config/env";
import { run } from "graphile-worker";
import * as Sentry from "@sentry/node";
import jobs from "./jobs";
import { closeWorkerUtils } from "./queues/queue";
import { SENTRY } from "./shared/config/config";
import { prisma } from "./shared/db/prisma";
import taskList from "./workers/task-list";

type WorkerRunner = Awaited<ReturnType<typeof run>>;

let runner: WorkerRunner | null = null;
let shuttingDown = false;

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

async function startWorker() {
  console.log("[Worker] Starting Graphile Worker...");

  if (SENTRY.DSN) {
    Sentry.init({
      dsn: SENTRY.DSN,
      environment: SENTRY.ENV,
      release: SENTRY.RELEASE,
    });
    console.log("[Worker] Sentry initialized");
  }

  runner = await run({
    connectionString: getConnectionString(),
    concurrency: Number(process.env.WORKER_CONCURRENCY || 5),
    taskList,
    noHandleSignals: true,
  });

  jobs.registerJobs();
  console.log("[Worker] Ready", {
    concurrency: Number(process.env.WORKER_CONCURRENCY || 5),
    tasks: Object.keys(taskList),
  });

  runner.promise.catch((error) => {
    if (shuttingDown) return;
    console.error("[Worker] Runner failed", error);
    if (SENTRY.DSN) Sentry.captureException(error);
    void shutdown("runner_failure", 1);
  });
}

async function shutdown(reason: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Worker] ${reason}; shutting down...`);

  const forceExitTimer = setTimeout(() => {
    console.error("[Worker] Graceful shutdown timed out");
    process.exit(1);
  }, 30_000);
  forceExitTimer.unref();

  try {
    if (runner) {
      await runner.stop();
      runner = null;
    }
    await closeWorkerUtils();
    await prisma.$disconnect();
    if (SENTRY.DSN) await Sentry.close(2_000);
  } catch (error) {
    console.error("[Worker] Shutdown failed", error);
    exitCode = 1;
  } finally {
    clearTimeout(forceExitTimer);
    process.exit(exitCode);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

process.once("uncaughtException", (error) => {
  console.error("[Worker] Uncaught exception", error);
  if (SENTRY.DSN) Sentry.captureException(error);
  void shutdown("uncaughtException", 1);
});

process.once("unhandledRejection", (reason) => {
  console.error("[Worker] Unhandled rejection", reason);
  if (SENTRY.DSN) Sentry.captureException(reason);
  void shutdown("unhandledRejection", 1);
});

startWorker().catch((error) => {
  console.error("[Worker] Failed to start", error);
  if (SENTRY.DSN) Sentry.captureException(error);
  void shutdown("startup_failure", 1);
});
