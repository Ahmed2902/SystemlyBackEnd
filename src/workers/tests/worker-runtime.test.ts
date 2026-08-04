import type { TaskList } from "graphile-worker";
import {
  resolveWorkerConcurrency,
  resolveWorkerConnectionString,
  runOneShotWorker,
  type WorkerLogger,
} from "../worker-runtime";

const taskList = {
  test_task: async () => undefined,
} satisfies TaskList;

function makeLogger(): WorkerLogger {
  return {
    info: jest.fn(),
    error: jest.fn(),
  };
}

describe("worker runtime", () => {
  describe("configuration", () => {
    it("prefers DATABASE_URL", () => {
      expect(
        resolveWorkerConnectionString({
          DATABASE_URL: "postgres://primary",
          DATABASE_URL_LOCAL: "postgres://local",
        }),
      ).toBe("postgres://primary");
    });

    it("falls back to DATABASE_URL_LOCAL", () => {
      expect(
        resolveWorkerConnectionString({
          DATABASE_URL_LOCAL: "postgres://local",
        }),
      ).toBe("postgres://local");
    });

    it("fails when no database URL exists", () => {
      expect(() => resolveWorkerConnectionString({})).toThrow(
        "Graphile Worker requires DATABASE_URL or DATABASE_URL_LOCAL",
      );
    });

    it("normalizes concurrency and uses a safe fallback", () => {
      expect(resolveWorkerConcurrency({ WORKER_CONCURRENCY: "4" })).toBe(4);
      expect(resolveWorkerConcurrency({ WORKER_CONCURRENCY: "2.9" })).toBe(2);
      expect(resolveWorkerConcurrency({ WORKER_CONCURRENCY: "0" })).toBe(3);
      expect(resolveWorkerConcurrency({ WORKER_CONCURRENCY: "invalid" })).toBe(
        3,
      );
    });
  });

  it("drains jobs and closes resources in order", async () => {
    const calls: string[] = [];
    const runJobsOnce = jest.fn(async () => {
      calls.push("run");
    });

    await runOneShotWorker({
      runJobsOnce,
      taskList,
      env: {
        DATABASE_URL: "postgres://database",
        WORKER_CONCURRENCY: "2",
      },
      logger: makeLogger(),
      resources: [
        { name: "first", close: async () => void calls.push("first") },
        { name: "second", close: async () => void calls.push("second") },
      ],
    });

    expect(runJobsOnce).toHaveBeenCalledWith({
      connectionString: "postgres://database",
      concurrency: 2,
      taskList,
    });
    expect(calls).toEqual(["run", "first", "second"]);
  });

  it("still closes every resource when job execution fails", async () => {
    const runError = new Error("worker failed");
    const firstClose = jest.fn(async () => undefined);
    const secondClose = jest.fn(async () => undefined);

    await expect(
      runOneShotWorker({
        runJobsOnce: async () => {
          throw runError;
        },
        taskList,
        env: { DATABASE_URL: "postgres://database" },
        logger: makeLogger(),
        resources: [
          { name: "first", close: firstClose },
          { name: "second", close: secondClose },
        ],
      }),
    ).rejects.toBe(runError);

    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(secondClose).toHaveBeenCalledTimes(1);
  });

  it("reports cleanup failure after successful processing", async () => {
    const cleanupError = new Error("cleanup failed");

    await expect(
      runOneShotWorker({
        runJobsOnce: async () => undefined,
        taskList,
        env: { DATABASE_URL: "postgres://database" },
        logger: makeLogger(),
        resources: [
          {
            name: "database",
            close: async () => {
              throw cleanupError;
            },
          },
        ],
      }),
    ).rejects.toMatchObject({
      message: "One-shot worker completed but resource cleanup failed",
      errors: [cleanupError],
    });
  });
});
