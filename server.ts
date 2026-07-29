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
}

// Background jobs are run in a dedicated worker process (see src/worker.ts)

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down gracefully...`);

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  await disconnectPrisma();
  process.exit(0);
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
});

void startServer().catch(async (error) => {
  console.error("Server startup failed:", error);
  if (SENTRY.DSN) Sentry.captureException(error);
  await disconnectPrisma().catch(() => undefined);
  process.exit(1);
});
