import {
  authUserSchema,
  refreshTokenBodySchema,
} from "../src/modules/auth/auth.schema";

describe("cookie-backed auth schemas", () => {
  it("accepts an empty refresh body because the token comes from the cookie", () => {
    expect(refreshTokenBodySchema.safeParse({}).success).toBe(true);
  });

  it("does not require a refresh token in the request body", () => {
    const parsed = refreshTokenBodySchema.parse({
      refreshToken: "legacy-body-token",
    });
    expect(parsed).toEqual({});
  });

  it("documents the complete user shape returned to the frontend", () => {
    expect(
      authUserSchema.safeParse({
        id: "user-1",
        name: "Ahmed",
        email: "ahmed@example.com",
        businessId: "business-1",
        role: "BusinessAdmin",
        preferredLanguage: "en",
        vertical: "salon",
        timezone: "Africa/Cairo",
      }).success,
    ).toBe(true);
  });
});
