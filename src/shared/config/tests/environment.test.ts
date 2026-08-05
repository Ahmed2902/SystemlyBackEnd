import { validateEnvironment } from "../environment";

describe("validateEnvironment", () => {
  test("allows focused test configuration", () => {
    expect(
      validateEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/systemly",
      }),
    ).toEqual(
      expect.objectContaining({
        NODE_ENV: "test",
        DATABASE_URL: "postgresql://user:pass@localhost:5432/systemly",
      }),
    );
  });

  test("rejects missing production secrets", () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db.example.com:5432/systemly",
      }),
    ).toThrow("JWT_SECRET is required in production");
  });

  test("accepts complete production configuration", () => {
    const result = validateEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@db.example.com:5432/systemly",
      JWT_SECRET: "access-secret",
      JWT_REFRESH_SECRET: "refresh-secret",
      FRONTEND_URL: "https://app.systemly.example",
      APP_URL: "https://api.systemly.example",
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Systemly <hello@systemly.example>",
      SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      SUPABASE_STORAGE_BUCKET: "uploads",
    });

    expect(result.NODE_ENV).toBe("production");
  });
});
