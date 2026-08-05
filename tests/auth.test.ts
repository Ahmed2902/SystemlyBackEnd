import authRoutes from "../src/modules/auth/auth.routes";

function handlersFor(path: string) {
  const router = authRoutes as any;
  const layer = (router.stack || []).find(
    (entry: any) => entry?.route?.path === path,
  );
  expect(layer).toBeTruthy();
  return layer.route.stack.map((entry: any) => entry.handle?.name);
}

describe("auth routes", () => {
  test("protects only cookie-authenticated session mutations", () => {
    expect(handlersFor("/refresh")).toContain("csrfProtection");
    expect(handlersFor("/logout")).toContain("csrfProtection");

    expect(handlersFor("/preferences")).not.toContain("csrfProtection");
    expect(handlersFor("/register")).not.toContain("csrfProtection");
    expect(handlersFor("/forgot-password")).not.toContain("csrfProtection");
    expect(handlersFor("/reset-password")).not.toContain("csrfProtection");
  });

  test("Google OAuth routes use state rather than CSRF middleware", () => {
    expect(handlersFor("/oauth/google")).not.toContain("csrfProtection");
    expect(handlersFor("/oauth/google/callback")).not.toContain(
      "csrfProtection",
    );
  });
});
