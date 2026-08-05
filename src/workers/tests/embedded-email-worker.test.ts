jest.mock("graphile-worker", () => ({
  run: jest.fn(),
}));

jest.mock("../../shared/observability/sentry", () => ({
  captureException: jest.fn(),
}));

import { run } from "graphile-worker";
import { EmbeddedEmailWorker } from "../embedded-email-worker";

const mockedRun = run as jest.MockedFunction<typeof run>;

describe("EmbeddedEmailWorker", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/systemly";
  });

  afterAll(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  test("coalesces concurrent startup and stops the runner", async () => {
    const stop = jest.fn().mockResolvedValue(undefined);
    mockedRun.mockResolvedValue({
      stop,
      promise: new Promise<void>(() => undefined),
    } as Awaited<ReturnType<typeof run>>);

    const worker = new EmbeddedEmailWorker();
    const onFatal = jest.fn();

    await Promise.all([worker.start(onFatal), worker.start(onFatal)]);

    expect(mockedRun).toHaveBeenCalledTimes(1);
    expect(mockedRun).toHaveBeenCalledWith(
      expect.objectContaining({ concurrency: 1, noHandleSignals: true }),
    );
    expect(worker.isReady()).toBe(true);

    await worker.stop();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(worker.isReady()).toBe(false);
    expect(onFatal).not.toHaveBeenCalled();
  });

  test("reports an unexpected runner failure", async () => {
    let rejectRunner!: (error: Error) => void;
    const runnerPromise = new Promise<void>((_resolve, reject) => {
      rejectRunner = reject;
    });
    mockedRun.mockResolvedValue({
      stop: jest.fn().mockResolvedValue(undefined),
      promise: runnerPromise,
    } as Awaited<ReturnType<typeof run>>);

    const worker = new EmbeddedEmailWorker();
    const onFatal = jest.fn();
    await worker.start(onFatal);

    const error = new Error("worker failed");
    rejectRunner(error);
    await new Promise((resolve) => setImmediate(resolve));

    expect(worker.isReady()).toBe(false);
    expect(onFatal).toHaveBeenCalledWith(error);
  });

  test("fails fast when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;
    const worker = new EmbeddedEmailWorker();

    await expect(worker.start(jest.fn())).rejects.toThrow(
      "DATABASE_URL is required by Graphile Worker",
    );
  });
});
