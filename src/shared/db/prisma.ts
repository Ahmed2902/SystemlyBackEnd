import { PrismaClient } from "@prisma/client";
import { recordPrismaQuery } from "../observability/request-context";

const basePrisma = new PrismaClient();

export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const startedAtMs = performance.now();
        try {
          return await query(args);
        } finally {
          recordPrismaQuery({
            model,
            operation,
            durationMs:
              Math.round((performance.now() - startedAtMs) * 100) / 100,
          });
        }
      },
    },
  },
});
