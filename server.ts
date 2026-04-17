import "dotenv/config";

import type { Server } from "http";

import * as Sentry from "@sentry/node";
import app from "./app";
import { APP_CONFIG, SENTRY } from "./src/shared/config/config";
import { prisma } from "./src/shared/db/prisma";

const PORT = APP_CONFIG.port;
let server: Server;

const startServer = () => {
  if (SENTRY.DSN) {
    Sentry.init({
      dsn: SENTRY.DSN,
      environment: SENTRY.ENV,
      release: SENTRY.RELEASE,
      tracesSampleRate: 0.05,
    });
    console.log("Sentry initialized");
  }

  server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

// Background jobs are run in a dedicated worker process (see src/worker.ts)

const shutdown = async (signal: string) => {
  console.log(`${signal} received. Shutting down gracefully...`);

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
  if (SENTRY.DSN) Sentry.captureException(reason as any);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  if (SENTRY.DSN) Sentry.captureException(error as any);
});

startServer();
