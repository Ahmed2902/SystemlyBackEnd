import type { Server } from "http";

import * as Sentry from "@sentry/node";
import app from "./app";
import { APP_CONFIG, SENTRY } from "./src/shared/config/config";
import { prisma } from "./src/shared/db/prisma";

const PORT = Number(process.env.PORT) || APP_CONFIG.port || 3000;
let server: Server | undefined;
let shuttingDown = false;

function initialiseSentry() {
  if (!SENTRY.DSN) return;

  Sentry.init({
    dsn: SENTRY.DSN,
    environment: SENTRY.ENV,
    release: SENTRY.RELEASE,
    tracesSampleRate: 0.05,
  });
  console.log("Sentry initialized");
}

async function startServer() {
  initialiseSentry();

  // Establish and validate the database connection before the process reports
  // itself ready. This prevents the first user request from paying the cold
  // connection cost and avoids serving traffic with an unavailable database.
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;

  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
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
    await prisma.$disconnect();
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
  if (SENTRY.DSN) Sentry.captureException(reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  if (SENTRY.DSN) Sentry.captureException(error);
  void shutdown("uncaughtException", 1);
});

void startServer().catch(async (error: unknown) => {
  console.error("Server startup failed:", error);
  if (SENTRY.DSN) Sentry.captureException(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});