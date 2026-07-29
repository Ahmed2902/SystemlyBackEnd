import type { Server } from "http";

import * as Sentry from "@sentry/node";
import app from "./app";
import { APP_CONFIG, SENTRY } from "./src/shared/config/config";
import {
  connectPrisma,
  disconnectPrisma,
} from "./src/shared/db/prisma";

const PORT = Number(process.env.PORT) || APP_CONFIG.port || 3000;
let server: Server | undefined;
let shuttingDown = false;

async function startServer() {
  if (SENTRY.DSN) {
    Sentry.init({
      dsn: SENTRY.DSN,
      environment: SENTRY.ENV,
      release: SENTRY.RELEASE,
      tracesSampleRate: 0.05,
    });
    console.log("Sentry initialized");
  }

  await connectPrisma();

  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1_000;
}

// Background jobs are run in a dedicated worker process (see src/worker.ts)

async function shutdown(signal: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received. Shutting down gracefully...`);

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  } finally {
    await disconnectPrisma().catch((error: unknown) => {
      console.error("Prisma disconnect failed:", error);
    });
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
  if (SENTRY.DSN) Sentry.captureException(reason as unknown);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  if (SENTRY.DSN) Sentry.captureException(error);
  void shutdown("uncaughtException", 1);
});

void startServer().catch(async (error: unknown) => {
  console.error("Server startup failed:", error);
  if (SENTRY.DSN) Sentry.captureException(error);
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
