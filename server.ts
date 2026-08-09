import "./src/instrument-api";

import type { Server } from "http";
import app from "./app";
import {
  configureEmailRuntime,
  getEmailDeliveryMode,
} from "./src/queues/emailQueue";
import { APP_CONFIG } from "./src/shared/config/config";
import { disconnect as disconnectRedis } from "./src/shared/config/redis";
import {
  connectPrisma,
  disconnectPrisma,
} from "./src/shared/db/prisma";
import logger from "./src/shared/observability/logger";
import {
  captureException,
  flushSentry,
} from "./src/shared/observability/sentry";
import { closeWorkerUtils } from "./src/queues/queue";
import { embeddedEmailWorker } from "./src/workers/embedded-email-worker";

const PORT = Number(process.env.PORT) || APP_CONFIG.port || 3000;
const SHUTDOWN_DEADLINE_MS = 10_000;
let server: Server | undefined;
let shuttingDown = false;

// This file is the long-lived process entrypoint. Serverless deployments import
// app/index directly and therefore never opt into persistent worker mode.
configureEmailRuntime("persistent_server");

async function startServer() {
  await connectPrisma();

  if (getEmailDeliveryMode() === "worker") {
    await embeddedEmailWorker.start((error) => {
      logger.error("email_worker_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      void shutdown("email_worker_failure", 1);
    });
  }

  server = app.listen(PORT, "0.0.0.0", () => {
    logger.info("server_started", { port: PORT, environment: APP_CONFIG.nodeEnv });
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1_000;
}

async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("shutdown_started", { signal });

  const deadline = setTimeout(() => {
    logger.error("shutdown_deadline_exceeded", { signal });
    server?.closeAllConnections();
    process.exit(exitCode || 1);
  }, SHUTDOWN_DEADLINE_MS);
  deadline.unref();

  try {
    if (server) {
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
    }

    await embeddedEmailWorker.stop();
    await closeWorkerUtils();
    await disconnectRedis();
  } catch (error) {
    exitCode = 1;
    logger.error("shutdown_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    captureException(error, "api", { failure_type: "shutdown" });
  } finally {
    await disconnectPrisma().catch((error: unknown) => {
      exitCode = 1;
      logger.error("prisma_disconnect_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
    await flushSentry();
    clearTimeout(deadline);
    process.exit(exitCode);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error("unhandled_rejection", {
    message: reason instanceof Error ? reason.message : String(reason),
  });
  captureException(reason, "api", { failure_type: "unhandled_rejection" });
});

process.on("uncaughtException", (error) => {
  logger.error("uncaught_exception", { message: error.message });
  captureException(error, "api", { failure_type: "uncaught_exception" });
  void shutdown("uncaughtException", 1);
});

void startServer().catch(async (error: unknown) => {
  logger.error("server_startup_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  captureException(error, "api", { failure_type: "startup" });
  await embeddedEmailWorker.stop().catch(() => undefined);
  await closeWorkerUtils().catch(() => undefined);
  await disconnectRedis().catch(() => undefined);
  await disconnectPrisma().catch(() => undefined);
  await flushSentry();
  process.exit(1);
});