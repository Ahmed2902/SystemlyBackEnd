import { PrismaClient } from "@prisma/client";
import { performance } from "node:perf_hooks";
import { recordPrismaQuery } from "../observability/request-context";

const basePrisma = new PrismaClient();

const instrumentedPrisma = basePrisma.$extends({
  name: "request-performance-instrumentation",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const startedAtMs = performance.now();

        try {
          return await query(args);
        } finally {
          const endedAtMs = performance.now();
          recordPrismaQuery({
            model,
            operation,
            durationMs: Math.max(0, endedAtMs - startedAtMs),
            startedAtMs,
            endedAtMs,
          });
        }
      },
    },
  },
});

// Prisma extensions deliberately expose a narrower generated type. The runtime
// client remains API-compatible with PrismaClient, and keeping the public type
// stable avoids forcing unsafe casts throughout transaction-aware services.
export const prisma = instrumentedPrisma as unknown as PrismaClient;

export async function connectPrisma() {
  await basePrisma.$connect();
  await basePrisma.$queryRaw`SELECT 1`;
}

export function disconnectPrisma() {
  return basePrisma.$disconnect();
}
