import { PrismaClient } from "@prisma/client";
import { performance } from "node:perf_hooks";
import { recordPrismaQuery } from "../observability/request-context";

export const prisma = new PrismaClient({
  log: [{ emit: "event", level: "query" }],
});

prisma.$on("query", (event) => {
  const endedAtMs = performance.now();
  const durationMs = Math.max(0, event.duration);
  const startedAtMs = endedAtMs - durationMs;
  const operation = event.query.trim().split(/\s+/, 1)[0]?.toUpperCase() || "QUERY";

  recordPrismaQuery({
    model: null,
    operation,
    durationMs,
    startedAtMs,
    endedAtMs,
  });
});
