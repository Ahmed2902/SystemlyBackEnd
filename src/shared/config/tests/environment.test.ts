import { validateEnvironment } from "../environment";

function completeProductionEnvironment(overrides: Record<string, string> = {}) {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@db.example.com:5432/systemly",
    JWT_SECRET: "a".repeat(32),
    JWT_REFRESH_SECRET: "r".repeat(32),
    CSRF_SECRET: "c".repeat(32),
    FRONTEND_URL: "https://app.systemly.example",
    APP_URL: "https://api.systemly.example",
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GOOGLE_REDIRECT_URI:
      "https://api.systemly.example/api/auth/oauth/google/callback",
    RESEND_API_KEY: "re_test",
    EMAIL_FROM: "Systemly <hello@systemly.example>",
    SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SUPABASE_PUBLIC_MEDIA_BUCKET: "public-media",
    SUPABASE_PRIVATE_MEDIA_BUCKET: "private-media",
    ...overrides,
  };
}

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

  test("rejects weak production signing secrets", () => {
    expect(() =>
      validateEnvironment(
        completeProductionEnvironment({ JWT_SECRET: "too-short" }),
      ),
    ).toThrow("JWT_SECRET must contain at least 32 characters in production");
  });

  test.each([
    ["FRONTEND_URL", "http://localhost:3000"],
    ["APP_URL", "http://localhost:3003"],
    [
      "GOOGLE_REDIRECT_URI",
      "http://localhost:3003/api/auth/oauth/google/callback",
    ],
  ])("rejects local production URL for %s", (key, value) => {
    expect(() =>
      validateEnvironment(completeProductionEnvironment({ [key]: value })),
    ).toThrow();
  });

  test("rejects a Google callback that does not match APP_URL", () => {
    expect(() =>
      validateEnvironment(
        completeProductionEnvironment({
          GOOGLE_REDIRECT_URI:
            "https://different.example/api/auth/oauth/google/callback",
        }),
      ),
    ).toThrow("GOOGLE_REDIRECT_URI must equal");
  });

  test("accepts complete production configuration", () => {
    const result = validateEnvironment(completeProductionEnvironment());
    expect(result.NODE_ENV).toBe("production");
  });
});
