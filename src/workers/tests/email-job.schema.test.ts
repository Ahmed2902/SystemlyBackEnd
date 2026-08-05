import { emailJobSchema } from "../email-job.schema";

describe("emailJobSchema", () => {
  test("accepts a valid verification email", () => {
    const result = emailJobSchema.parse({
      type: "verification",
      to: "owner@example.com",
      idempotencyKey: "verification:user-1:token-1",
      data: {
        name: "Ahmed",
        verificationUrl: "https://app.systemly.test/verify-email?token=abc",
        locale: "en",
      },
    });

    expect(result.type).toBe("verification");
  });

  test("rejects unsupported persisted job types", () => {
    expect(() =>
      emailJobSchema.parse({
        type: "appointment_reminder",
        to: "customer@example.com",
        data: {},
      }),
    ).toThrow();
  });

  test("rejects malformed links before delivery", () => {
    expect(() =>
      emailJobSchema.parse({
        type: "password_reset",
        to: "owner@example.com",
        data: {
          name: "Ahmed",
          resetUrl: "not-a-url",
          locale: "en",
        },
      }),
    ).toThrow();
  });
});
