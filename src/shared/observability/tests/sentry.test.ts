import {
  captureException,
  flushSentry,
  initializeSentry,
  shouldCaptureHttpError,
} from "../sentry";

describe("Sentry observability boundary", () => {
  it("captures only unexpected server-side HTTP failures", () => {
    expect(shouldCaptureHttpError(400)).toBe(false);
    expect(shouldCaptureHttpError(404)).toBe(false);
    expect(shouldCaptureHttpError(499)).toBe(false);
    expect(shouldCaptureHttpError(500)).toBe(true);
    expect(shouldCaptureHttpError(503)).toBe(true);
  });

  it("stays disabled during tests even when called by entrypoints", async () => {
    expect(initializeSentry("api")).toBe(false);
    expect(captureException(new Error("test"), "api")).toBeUndefined();
    await expect(flushSentry()).resolves.toBe(true);
  });
});
