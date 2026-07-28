import { AsyncLocalStorage } from "node:async_hooks";

export type PrismaQuerySample = {
  model: string;
  operation: string;
  durationMs: number;
};

export type RequestPerformanceContext = {
  requestId: string;
  startedAtMs: number;
  queryCount: number;
  queryDurationMs: number;
  slowestQueries: PrismaQuerySample[];
};

const requestStorage = new AsyncLocalStorage<RequestPerformanceContext>();
const MAX_SLOW_QUERY_SAMPLES = 5;

export function runWithRequestContext<T>(
  context: RequestPerformanceContext,
  callback: () => T,
): T {
  return requestStorage.run(context, callback);
}

export function getRequestContext() {
  return requestStorage.getStore();
}

export function recordPrismaQuery(sample: PrismaQuerySample) {
  const context = requestStorage.getStore();
  if (!context) return;

  context.queryCount += 1;
  context.queryDurationMs += sample.durationMs;
  context.slowestQueries.push(sample);
  context.slowestQueries.sort((left, right) => right.durationMs - left.durationMs);

  if (context.slowestQueries.length > MAX_SLOW_QUERY_SAMPLES) {
    context.slowestQueries.length = MAX_SLOW_QUERY_SAMPLES;
  }
}
