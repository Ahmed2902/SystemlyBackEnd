import { PrismaClient } from "@prisma/client";
import { performance } from "node:perf_hooks";
import { recordPrismaQuery } from "../observability/request-context";

const basePrisma = new PrismaClient();

export const prisma = basePrisma.$extends({
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
