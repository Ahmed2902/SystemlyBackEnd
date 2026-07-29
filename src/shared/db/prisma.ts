import { PrismaClient } from "@prisma/client";
import { performance } from "node:perf_hooks";
import { recordPrismaQuery } from "../observability/request-context";

const basePrisma = new PrismaClient();

// Prisma engine log events do not retain Node's AsyncLocalStorage context, so
// they cannot reliably be attributed to the HTTP request that caused them.
// A query extension runs in the caller's async context and measures the full
// awaited operation, including connection-pool and network time.
const instrumentedPrisma = basePrisma.$extends({
  name: "request-performance",
  query: {
    async $allOperations({ model, operation, args, query }) {
      const startedAtMs = performance.now();

      try {
        return await query(args);
      } finally {
        const endedAtMs = performance.now();
        recordPrismaQuery({
          model: model ?? null,
          operation,
          durationMs: Math.max(0, endedAtMs - startedAtMs),
          startedAtMs,
          endedAtMs,
        });
      }
    },
  },
});

// Preserve the existing public client type. Prisma's extended-client generic is
// runtime-compatible but is not structurally assignable to TransactionClient,
// which is used throughout the service layer for shared query helpers.
export const prisma: PrismaClient =
  instrumentedPrisma as unknown as PrismaClient;
