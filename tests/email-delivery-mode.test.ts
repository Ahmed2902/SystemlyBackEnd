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
  const originalMode = process.env.EMAIL_DELIVERY_MODE;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.VERCEL;
    delete process.env.EMAIL_DELIVERY_MODE;
  });

  afterAll(() => {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;

    if (originalMode === undefined) delete process.env.EMAIL_DELIVERY_MODE;
    else process.env.EMAIL_DELIVERY_MODE = originalMode;
  });

  test("defaults to inline delivery on Vercel", async () => {
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

  test("keeps Graphile Worker as the default outside Vercel", async () => {
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
    process.env.VERCEL = "1";
    process.env.EMAIL_DELIVERY_MODE = "worker";

    expect(getEmailDeliveryMode()).toBe("worker");
  });

  test("inline mode rejects delayed delivery instead of sending early", async () => {
    process.env.VERCEL = "1";

    await expect(
      enqueueSendEmail(verificationJob, { delayMs: 60_000 }),
    ).rejects.toThrow(
      "Delayed email jobs require EMAIL_DELIVERY_MODE=worker",
    );

    expect(mockedSendEmailTask).not.toHaveBeenCalled();
    expect(mockedGetWorkerUtils).not.toHaveBeenCalled();
  });
});
