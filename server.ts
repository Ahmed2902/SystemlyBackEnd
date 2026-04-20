import "dotenv/config";

import type { Server } from "http";

// ─── Startup diagnostics ────────────────────────────────────────────────────
// Register process-level error handlers FIRST — before any imports that could
// throw — so we always capture the root cause even if it happens at module
// evaluation time.
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection:", reason);
  try {
    // Sentry may not be initialised yet; guard the call.
    const { SENTRY } = require("./src/shared/config/config");
    if (SENTRY?.DSN) {
      const Sentry = require("@sentry/node");
      Sentry.captureException(reason);
    }
  } catch (_) {
    // ignore secondary errors inside the handler
  }
  // Exit so Railway restarts the container and surfaces the error in logs.
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("[server] Uncaught exception:", error);
  try {
    const { SENTRY } = require("./src/shared/config/config");
    if (SENTRY?.DSN) {
      const Sentry = require("@sentry/node");
      Sentry.captureException(error);
    }
  } catch (_) {
    // ignore secondary errors inside the handler
  }
  process.exit(1);
});

// ─── Startup timeout ────────────────────────────────────────────────────────
// If the server hasn't called app.listen's callback within 10 s something is
// hanging (e.g. a Redis/DB connection blocking the event loop).
const STARTUP_TIMEOUT_MS = 10_000;
const startupTimer = setTimeout(() => {
  console.error(
    `[server] STARTUP TIMEOUT — server did not finish initialising within ${STARTUP_TIMEOUT_MS / 1000}s. ` +
      "Check for hanging Redis/DB connections or blocking synchronous code."
  );
  process.exit(1);
}, STARTUP_TIMEOUT_MS);
// Don't let this timer keep the process alive on its own.
startupTimer.unref();

// ─── Imports ────────────────────────────────────────────────────────────────
console.log("[server] Loading modules...");

import * as Sentry from "@sentry/node";
import app from "./app";
import { APP_CONFIG, SENTRY } from "./src/shared/config/config";
import { prisma } from "./src/shared/db/prisma";

console.log("[server] Modules loaded successfully.");

const PORT = APP_CONFIG.port;
let server: Server;
let serverReady = false;

// ─── Redis connectivity check ────────────────────────────────────────────────
// Redis is imported at module level in several services. If REDIS_URL is unset
// ioredis defaults to 127.0.0.1:6379 which will never connect in production
// and can cause silent hangs or unhandled errors. Log the resolved URL so it
// is visible in deployment logs.
const redisUrl =
  process.env.REDIS_URL ||
  (process.env.NODE_ENV === "development" ? "redis://localhost:6379" : null);

if (!redisUrl) {
  console.warn(
    "[server] WARNING: REDIS_URL is not set. Redis will attempt to connect to " +
      "redis://127.0.0.1:6379 (ioredis default). This will fail in production " +
      "and may cause silent startup hangs. Set REDIS_URL to a valid Redis URL."
  );
} else {
  // Mask credentials for safe logging.
  try {
    const parsed = new URL(redisUrl);
    if (parsed.password) parsed.password = "***";
    console.log(`[server] Redis URL resolved: ${parsed.toString()}`);
  } catch {
    console.log("[server] Redis URL resolved (could not parse for display).");
  }
}

// ─── Main startup ────────────────────────────────────────────────────────────
const startServer = async () => {
  console.log("[server] Starting server...");

  // 1. Sentry
  if (SENTRY.DSN) {
    console.log("[server] Initialising Sentry...");
    Sentry.init({
      dsn: SENTRY.DSN,
      environment: SENTRY.ENV,
      release: SENTRY.RELEASE,
      tracesSampleRate: 0.05,
    });
    console.log("[server] Sentry initialised.");
  } else {
    console.log("[server] Sentry DSN not set — skipping Sentry init.");
  }

  // 2. HTTP server
  console.log(`[server] Binding to port ${PORT}...`);
  await new Promise<void>((resolve, reject) => {
    server = app.listen(PORT, () => {
      serverReady = true;
      clearTimeout(startupTimer);
      console.log(`[server] Server running on http://localhost:${PORT}`);
      resolve();
    });

    server.once("error", (err) => {
      reject(err);
    });
  });

  console.log("[server] Startup complete.");
};

// Background jobs are run in a dedicated worker process (see src/worker.ts)

const shutdown = async (signal: string) => {
  console.log(`[server] ${signal} received. Shutting down gracefully...`);

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

// ─── Kick off ────────────────────────────────────────────────────────────────
startServer().catch((err) => {
  console.error("[server] Fatal error during startup:", err);
  try {
    if (SENTRY.DSN) Sentry.captureException(err);
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
