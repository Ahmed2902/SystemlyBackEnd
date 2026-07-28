import { AsyncLocalStorage } from "node:async_hooks";

export type PrismaQuerySample = {
  model: string | null;
  operation: string;
  durationMs: number;
};

type PrismaQueryInterval = {
  startedAtMs: number;
  endedAtMs: number;
};

export type RequestPerformanceContext = {
  requestId: string;
  startedAtMs: number;
  queryCount: number;
  queryDurationMs: number;
  queryIntervals: PrismaQueryInterval[];
  slowestQueries: PrismaQuerySample[];
};

type RecordedPrismaQuery = PrismaQuerySample & PrismaQueryInterval;

const requestStorage = new AsyncLocalStorage<RequestPerformanceContext>();
const MAX_SLOW_QUERY_SAMPLES = 5;

export function runWithRequestContext<T>(
  context: RequestPerformanceContext,
  callback: () => T,
): T {
  return requestStorage.run(context, callback);
}

export function recordPrismaQuery(sample: RecordedPrismaQuery) {
  const context = requestStorage.getStore();
  if (!context) return;

  context.queryCount += 1;
  context.queryDurationMs += sample.durationMs;
  context.queryIntervals.push({
    startedAtMs: sample.startedAtMs,
    endedAtMs: sample.endedAtMs,
  });
  context.slowestQueries.push({
    model: sample.model,
    operation: sample.operation,
    durationMs: sample.durationMs,
  });
  context.slowestQueries.sort((left, right) => right.durationMs - left.durationMs);

  if (context.slowestQueries.length > MAX_SLOW_QUERY_SAMPLES) {
    context.slowestQueries.length = MAX_SLOW_QUERY_SAMPLES;
  }
}

export function getPrismaQueryWallTimeMs(
  context: RequestPerformanceContext,
): number {
  if (context.queryIntervals.length === 0) return 0;

  const intervals = [...context.queryIntervals].sort(
    (left, right) => left.startedAtMs - right.startedAtMs,
  );

  let totalMs = 0;
  let currentStart = intervals[0].startedAtMs;
  let currentEnd = intervals[0].endedAtMs;

  for (const interval of intervals.slice(1)) {
    if (interval.startedAtMs <= currentEnd) {
      currentEnd = Math.max(currentEnd, interval.endedAtMs);
      continue;
    }

    totalMs += currentEnd - currentStart;
    currentStart = interval.startedAtMs;
    currentEnd = interval.endedAtMs;
  }

  return totalMs + (currentEnd - currentStart);
}
