import "./shared/config/env";
import jobs from "./jobs";
import { prisma } from "./shared/db/prisma";
import * as Sentry from "@sentry/node";
import { SENTRY } from "./shared/config/config";

const startWorker = async () => {
  console.log("[Worker] Starting background worker (Graphile Worker)...");
  try {
    if (SENTRY.DSN) {
      Sentry.init({
        dsn: SENTRY.DSN,
        environment: SENTRY.ENV,
        release: SENTRY.RELEASE,
      });
      console.log("[Worker] Sentry initialized");
    }

    // Start Graphile Worker
    const gw = await import("graphile-worker");
    const connectionString =
      process.env.DATABASE_URL || process.env.DATABASE_URL_LOCAL;

    const taskList: any = {};

    // Single email task handled by dedicated worker implementation
    const emailTask = await import("./workers/email.worker");
    taskList["send_email"] =
      emailTask.default || emailTask.sendEmailTask || emailTask;

    // ETA receipt task (kept as-is)
    taskList["eta_receipt"] = async (payload: any, _helpers: any) => {
      const { prisma } = await import("./shared/db/prisma");
      // replicate previous ETA submission logic
      const invoiceId = payload.invoiceId;
      try {
        await new Promise((r) => setTimeout(r, 200));
        const etaUid = `ETA-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: { etaReceiptUid: etaUid, etaSubmittedAt: new Date() },
        });
        console.log(
          `[ETA] Receipt submitted for invoice ${invoiceId}: ${etaUid}`,
        );
      } catch (err) {
        console.error(
          `[ETA] Failed to submit receipt for invoice ${invoiceId}:`,
          err,
        );
        throw err;
      }
    };

    // Start worker in background (run returns a promise that resolves when worker shuts down)
    gw.run({
      connectionString,
      concurrency: 5,
      taskList,
      noHandleSignals: true,
    }).catch((err: any) => {
      console.error("[Worker] Graphile Worker failed:", err);
      if (SENTRY.DSN) Sentry.captureException(err as any);
      process.exit(1);
    });

    // Register cron-like jobs and scheduled registration logic
    jobs.registerJobs();
  } catch (err) {
    console.error("[Worker] Failed to start:", err);
    if (SENTRY.DSN) Sentry.captureException(err as any);
    process.exit(1);
  }
};

void startWorker();

const shutdown = async (signal: string) => {
  console.log(`${signal} received. Shutting down worker...`);
  try {
    await prisma.$disconnect();
  } catch (err) {
    // ignore
  }
  process.exit(0);
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
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in worker:", reason);
  if (SENTRY.DSN) Sentry.captureException(reason as any);
});

export default {};
