jest.mock("../src/workers/email.worker", () => ({
  sendEmailTask: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../src/queues/queue", () => ({
  getWorkerUtils: jest.fn(),
}));

import {
  enqueueSendEmail,
  getEmailDeliveryMode,
} from "../src/queues/emailQueue";
import { getWorkerUtils } from "../src/queues/queue";
import { sendEmailTask } from "../src/workers/email.worker";

const mockedGetWorkerUtils = getWorkerUtils as jest.MockedFunction<
  typeof getWorkerUtils
>;
const mockedSendEmailTask = sendEmailTask as jest.MockedFunction<
  typeof sendEmailTask
>;

const verificationJob = {
  type: "verification" as const,
  to: "delivered+queue-test@resend.dev",
  data: {
    name: "Queue Test",
    verificationUrl: "https://www.systemly.me/verify-email?token=test",
    locale: "en" as const,
  },
};

describe("email delivery mode", () => {
  const originalVercel = process.env.VERCEL;
  const originalVercelEnv = process.env.VERCEL_ENV;
  const originalVercelTargetEnv = process.env.VERCEL_TARGET_ENV;
  const originalAppUrl = process.env.APP_URL;
  const originalMode = process.env.EMAIL_DELIVERY_MODE;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_TARGET_ENV;
    delete process.env.APP_URL;
    delete process.env.EMAIL_DELIVERY_MODE;
  });

  afterAll(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;

    if (originalVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = originalVercelEnv;

    if (originalVercelTargetEnv === undefined) delete process.env.VERCEL_TARGET_ENV;
    else process.env.VERCEL_TARGET_ENV = originalVercelTargetEnv;

    if (originalAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = originalAppUrl;

    if (originalMode === undefined) delete process.env.EMAIL_DELIVERY_MODE;
    else process.env.EMAIL_DELIVERY_MODE = originalMode;
  });

  test("defaults to inline delivery when VERCEL is exposed", async () => {
    process.env.VERCEL = "1";

    expect(getEmailDeliveryMode()).toBe("inline");

    await enqueueSendEmail(verificationJob, {
      idempotencyKey: "verification:test-user:test-token",
    });

    expect(mockedSendEmailTask).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "verification",
        idempotencyKey: "verification:test-user:test-token",
      }),
    );
    expect(mockedGetWorkerUtils).not.toHaveBeenCalled();
  });

  test("detects Vercel from canonical APP_URL when system variables are hidden", async () => {
    process.env.APP_URL = "https://systemly-backend.vercel.app";

    expect(getEmailDeliveryMode()).toBe("inline");

    await enqueueSendEmail(verificationJob, {
      idempotencyKey: "verification:app-url:test-token",
    });

    expect(mockedSendEmailTask).toHaveBeenCalledTimes(1);
    expect(mockedGetWorkerUtils).not.toHaveBeenCalled();
  });

  test("keeps Graphile Worker as the default outside Vercel", async () => {
    process.env.APP_URL = "https://api.systemly.me";
    const addJob = jest.fn().mockResolvedValue({ id: "job-1" });
    mockedGetWorkerUtils.mockResolvedValue({ addJob } as never);

    expect(getEmailDeliveryMode()).toBe("worker");

    await enqueueSendEmail(verificationJob, {
      idempotencyKey: "verification:test-user:test-token",
    });

    expect(addJob).toHaveBeenCalledWith(
      "send_email",
      expect.objectContaining({
        type: "verification",
        idempotencyKey: "verification:test-user:test-token",
      }),
      expect.objectContaining({
        jobKey: "email:verification:test-user:test-token",
        maxAttempts: 5,
      }),
    );
    expect(mockedSendEmailTask).not.toHaveBeenCalled();
  });

  test("explicit worker mode overrides Vercel auto-detection", () => {
    process.env.APP_URL = "https://systemly-backend.vercel.app";
    process.env.EMAIL_DELIVERY_MODE = "worker";

    expect(getEmailDeliveryMode()).toBe("worker");
  });

  test("inline mode rejects delayed delivery instead of sending early", async () => {
    process.env.APP_URL = "https://systemly-backend.vercel.app";

    await expect(
      enqueueSendEmail(verificationJob, { delayMs: 60_000 }),
    ).rejects.toThrow(
      "Delayed email jobs require EMAIL_DELIVERY_MODE=worker",
    );

    expect(mockedSendEmailTask).not.toHaveBeenCalled();
    expect(mockedGetWorkerUtils).not.toHaveBeenCalled();
  });
});
