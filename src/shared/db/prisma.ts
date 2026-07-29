import { PrismaClient } from "@prisma/client";
import { performance } from "node:perf_hooks";
import { recordPrismaQuery } from "../observability/request-context";

const basePrisma = new PrismaClient();

async function measurePrismaOperation<T>(
  model: string | null,
  operation: string,
  execute: () => Promise<T>,
): Promise<T> {
  const startedAtMs = performance.now();

  try {
    return await execute();
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
}

const instrumentedPrisma = basePrisma.$extends({
  name: "request-performance-instrumentation",
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        return measurePrismaOperation(model, operation, () => query(args));
      },
    },
    $queryRaw({ args, query }) {
      return measurePrismaOperation(null, "$queryRaw", () => query(args));
    },
    $executeRaw({ args, query }) {
      return measurePrismaOperation(null, "$executeRaw", () => query(args));
    },
    $queryRawUnsafe({ args, query }) {
      return measurePrismaOperation(null, "$queryRawUnsafe", () => query(args));
    },
    $executeRawUnsafe({ args, query }) {
      return measurePrismaOperation(null, "$executeRawUnsafe", () => query(args));
    },
  },
});

// Query extensions retain the complete PrismaClient runtime API, but Prisma's
// generated extension type is not structurally assignable to helpers that
// accept Prisma.TransactionClient. Keep the public type stable at this single
// boundary instead of spreading casts throughout application services.
export const prisma = instrumentedPrisma as unknown as PrismaClient;

export async function connectPrisma() {
  await basePrisma.$connect();
  await basePrisma.$queryRaw`SELECT 1`;
}

export function disconnectPrisma() {
  return basePrisma.$disconnect();
}
