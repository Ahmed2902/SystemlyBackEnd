import "./shared/config/env";
import jobs from "./jobs";
import { prisma } from "./shared/db/prisma";
import { initEmailQueue } from "./queues/emailQueue";
import "./queues/processor"; // start processor when worker starts
import * as Sentry from "@sentry/node";
import { SENTRY } from "./shared/config/config";

const startWorker = async () => {
  console.log("[Worker] Starting background worker...");
  try {
    if (SENTRY.DSN) {
      Sentry.init({
        dsn: SENTRY.DSN,
        environment: SENTRY.ENV,
        release: SENTRY.RELEASE,
      });
      console.log("[Worker] Sentry initialized");
    }
    // init queue scheduler
    await initEmailQueue();
    jobs.registerJobs();
  } catch (err) {
    console.error("[Worker] Failed to register jobs:", err);
    if (SENTRY.DSN) Sentry.captureException(err as any);
    process.exit(1);
  }
};

void startWorker();

const shutdown = async (signal: string, exitCode = 0) => {
  console.log(`${signal} received. Shutting down worker...`);
  try {
    await prisma.$disconnect();
  } catch (err) {
    // ignore
  }
  process.exit(exitCode);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in worker:", err);
  if (SENTRY.DSN) Sentry.captureException(err as any);
  void shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in worker:", reason);
  if (SENTRY.DSN) Sentry.captureException(reason as any);
});

export default {};
