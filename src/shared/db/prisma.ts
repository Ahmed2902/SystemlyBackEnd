import "../config/env";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { performance } from "node:perf_hooks";
import { recordPrismaQuery } from "../observability/request-context";

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function parseBoolean(value: string | undefined) {
  if (value === undefined) return undefined;
  return ["1", "true", "yes"].includes(value.trim().toLowerCase());
}

function getPgConnectionConfig() {
  const rawConnectionString =
    process.env.DATABASE_URL ||
    process.env.PRISMA_DATABASE_URL ||
    process.env.SUPABASE_TRANSACTION_POOLER ||
    process.env.SUPABASE_CONNECTION_STRING;

  if (!rawConnectionString) {
    throw new Error("Missing database connection string.");
  }

  // Let node-postgres own TLS configuration. Prisma's native Windows TLS
  // engine can fail against Supabase's pooler before authentication starts.
  const url = new URL(rawConnectionString);
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();
  url.searchParams.delete("sslmode");

  const explicitSsl = parseBoolean(process.env.DATABASE_SSL_ENABLED);
  const sslDisabledByUrl = sslMode === "disable";
  const useSsl =
    explicitSsl ??
    (!sslDisabledByUrl && !LOCAL_DATABASE_HOSTS.has(url.hostname.toLowerCase()));

  return {
    connectionString: url.toString(),
    ssl: useSsl
      ? {
          rejectUnauthorized:
            process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true",
        }
      : false,
  } as const;
}

const connectionConfig = getPgConnectionConfig();
const adapter = new PrismaPg({
  ...connectionConfig,
  max: Number(process.env.DATABASE_POOL_MAX || 5),
  connectionTimeoutMillis: Number(
    process.env.DATABASE_CONNECTION_TIMEOUT_MS || 10_000,
  ),
});

const basePrisma = new PrismaClient({ adapter });

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
      return measurePrismaOperation(null, "$executeRawUnsafe", () =>
        query(args),
      );
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
