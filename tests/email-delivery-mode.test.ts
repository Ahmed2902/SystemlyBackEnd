jest.mock("../src/workers/email.worker", () => ({
  sendEmailTask: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../src/queues/queue", () => ({
  getWorkerUtils: jest.fn(),
}));

import {
  configureEmailRuntime,
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
  const originalMode = process.env.EMAIL_DELIVERY_MODE;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.EMAIL_DELIVERY_MODE;
    configureEmailRuntime("app_only");
  });

  afterAll(() => {
    configureEmailRuntime("app_only");
    if (originalMode === undefined) delete process.env.EMAIL_DELIVERY_MODE;
    else process.env.EMAIL_DELIVERY_MODE = originalMode;
  });

  test("app-only runtime delivers inline without environment detection", async () => {
    expect(getEmailDeliveryMode()).toBe("inline");

    await enqueueSendEmail(verificationJob, {
      idempotencyKey: "verification:app-only:test-token",
    });

    expect(mockedSendEmailTask).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "verification",
        idempotencyKey: "verification:app-only:test-token",
      }),
    );
    expect(mockedGetWorkerUtils).not.toHaveBeenCalled();
  });

  test("app-only runtime ignores stale worker configuration", async () => {
    process.env.EMAIL_DELIVERY_MODE = "worker";

    expect(getEmailDeliveryMode()).toBe("inline");

    await enqueueSendEmail(verificationJob, {
      idempotencyKey: "verification:stale-worker:test-token",
    });

    expect(mockedSendEmailTask).toHaveBeenCalledTimes(1);
    expect(mockedGetWorkerUtils).not.toHaveBeenCalled();
  });

  test("persistent server defaults to Graphile Worker", async () => {
    configureEmailRuntime("persistent_server");
    const addJob = jest.fn().mockResolvedValue({ id: "job-1" });
    mockedGetWorkerUtils.mockResolvedValue({ addJob } as never);

    expect(getEmailDeliveryMode()).toBe("worker");

    await enqueueSendEmail(verificationJob, {
      idempotencyKey: "verification:persistent:test-token",
    });

    expect(addJob).toHaveBeenCalledWith(
      "send_email",
      expect.objectContaining({
        type: "verification",
        idempotencyKey: "verification:persistent:test-token",
      }),
      expect.objectContaining({
        jobKey: "email:verification:persistent:test-token",
        maxAttempts: 5,
      }),
    );
    expect(mockedSendEmailTask).not.toHaveBeenCalled();
  });

  test("persistent server may explicitly choose inline delivery", () => {
    configureEmailRuntime("persistent_server");
    process.env.EMAIL_DELIVERY_MODE = "inline";

    expect(getEmailDeliveryMode()).toBe("inline");
  });

  test("app-only runtime rejects delayed delivery instead of sending early", async () => {
    await expect(
      enqueueSendEmail(verificationJob, { delayMs: 60_000 }),
    ).rejects.toThrow("Delayed email jobs require a persistent worker runtime");

    expect(mockedSendEmailTask).not.toHaveBeenCalled();
    expect(mockedGetWorkerUtils).not.toHaveBeenCalled();
  });
});