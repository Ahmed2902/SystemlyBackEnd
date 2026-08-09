import { validateEnvironment } from "../environment";

function coreProductionEnvironment(overrides: Record<string, string> = {}) {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@db.example.com:5432/systemly",
    JWT_SECRET: "a".repeat(32),
    JWT_REFRESH_SECRET: "r".repeat(32),
    CSRF_SECRET: "c".repeat(32),
    FRONTEND_URL: "https://app.systemly.example",
    APP_URL: "https://api.systemly.example",
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

  test("rejects missing core production secrets", () => {
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
        coreProductionEnvironment({ JWT_SECRET: "too-short" }),
      ),
    ).toThrow("JWT_SECRET must contain at least 32 characters in production");
  });

  test.each([
    ["FRONTEND_URL", "http://localhost:3000"],
    ["APP_URL", "http://localhost:3003"],
  ])("rejects local core production URL for %s", (key, value) => {
    expect(() =>
      validateEnvironment(coreProductionEnvironment({ [key]: value })),
    ).toThrow();
  });

  test("does not let a stale Google redirect override crash startup", () => {
    expect(() =>
      validateEnvironment(
        coreProductionEnvironment({
          GOOGLE_REDIRECT_URI: "http://localhost:3003/api/auth/oauth/google/callback",
        }),
      ),
    ).not.toThrow();
  });

  test("allows feature credentials to be configured independently", () => {
    const result = validateEnvironment(
      coreProductionEnvironment({
        GOOGLE_CLIENT_ID: "google-client",
        GOOGLE_CLIENT_SECRET: "google-secret",
        RESEND_API_KEY: "re_test",
        EMAIL_FROM: "Systemly <hello@systemly.example>",
        SENTRY_DSN: "https://public@example.ingest.sentry.io/1",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
        SUPABASE_PUBLIC_MEDIA_BUCKET: "public-media",
        SUPABASE_PRIVATE_MEDIA_BUCKET: "private-media",
      }),
    );

    expect(result.NODE_ENV).toBe("production");
    expect(result.RESEND_API_KEY).toBe("re_test");
  });

  test("accepts core production configuration without optional integrations", () => {
    const result = validateEnvironment(coreProductionEnvironment());
    expect(result.NODE_ENV).toBe("production");
  });
});