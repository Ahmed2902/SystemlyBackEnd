import "./src/instrument-api";

import type { Server } from "http";
import app from "./app";
import { APP_CONFIG } from "./src/shared/config/config";
import {
  connectPrisma,
  disconnectPrisma,
} from "./src/shared/db/prisma";
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

async function startServer() {
  await connectPrisma();
  await embeddedEmailWorker.start((error) => {
    console.error("Embedded email worker failed:", error);
    void shutdown("email_worker_failure", 1);
  });

  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1_000;
}

async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received. Shutting down gracefully...`);

  const deadline = setTimeout(() => {
    console.error("Shutdown deadline exceeded; forcing process exit.");
    server?.closeAllConnections();
    process.exit(exitCode || 1);
  }, SHUTDOWN_DEADLINE_MS);
  deadline.unref();

  try {
    if (server) {
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }

    await embeddedEmailWorker.stop();
    await closeWorkerUtils();
  } catch (error) {
    exitCode = 1;
    console.error("Application shutdown failed:", error);
    captureException(error, "api", { failure_type: "shutdown" });
  } finally {
    await disconnectPrisma().catch((error: unknown) => {
      exitCode = 1;
      console.error("Prisma disconnect failed:", error);
    });
    await flushSentry();
    clearTimeout(deadline);
    process.exit(exitCode);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  captureException(reason, "api", { failure_type: "unhandled_rejection" });
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  captureException(error, "api", { failure_type: "uncaught_exception" });
  void shutdown("uncaughtException", 1);
});

void startServer().catch(async (error: unknown) => {
  console.error("Server startup failed:", error);
  captureException(error, "api", { failure_type: "startup" });
  await embeddedEmailWorker.stop().catch(() => undefined);
  await closeWorkerUtils().catch(() => undefined);
  await disconnectPrisma().catch(() => undefined);
  await flushSentry();
  process.exit(1);
});
