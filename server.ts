import "dotenv/config";

import type { Server } from "http";

import app from "./app";
import { APP_CONFIG } from "./src/shared/config/constants";
import { prisma } from "./src/shared/db/prisma";

const PORT = APP_CONFIG.port;
let server: Server;

const startServer = () => {
  server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

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
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
});

startServer();
