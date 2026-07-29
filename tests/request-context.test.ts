import { performance } from "node:perf_hooks";
import {
  getPrismaQueryWallTimeMs,
  recordPrismaQuery,
  runWithRequestContext,
  type RequestPerformanceContext,
} from "../src/shared/observability/request-context";

function createContext(): RequestPerformanceContext {
  return {
    requestId: "request-1",
    startedAtMs: performance.now(),
    queryCount: 0,
    queryDurationMs: 0,
    queryIntervals: [],
    slowestQueries: [],
  };
}

describe("request performance context", () => {
  it("records query timing in the active async request context", async () => {
    const context = createContext();

    await runWithRequestContext(context, async () => {
      const startedAtMs = performance.now();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const endedAtMs = performance.now();

      recordPrismaQuery({
        model: "Staff",
        operation: "findMany",
        durationMs: endedAtMs - startedAtMs,
        startedAtMs,
        endedAtMs,
      });
    });

    expect(context.queryCount).toBe(1);
    expect(context.queryDurationMs).toBeGreaterThan(0);
    expect(getPrismaQueryWallTimeMs(context)).toBeGreaterThan(0);
    expect(context.slowestQueries).toEqual([
      expect.objectContaining({
        model: "Staff",
        operation: "findMany",
        durationMs: expect.any(Number),
      }),
    ]);
  });

  it("does not attribute queries when there is no active request", () => {
    const context = createContext();
    const startedAtMs = performance.now();

    recordPrismaQuery({
      model: "Staff",
      operation: "findMany",
      durationMs: 1,
      startedAtMs,
      endedAtMs: startedAtMs + 1,
    });

    expect(context.queryCount).toBe(0);
  });
});
