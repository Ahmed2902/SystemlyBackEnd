import authRoutes from "../src/modules/auth/auth.routes";

describe("auth routes", () => {
  test("Google OAuth routes do not use CSRF middleware", () => {
    const router: any = authRoutes as any;
    const stack: any[] = router.stack || [];

    const google = stack.find((l) => l?.route?.path === "/oauth/google");
    const googleCallback = stack.find(
      (l) => l?.route?.path === "/oauth/google/callback"
    );

    expect(google).toBeTruthy();
    expect(googleCallback).toBeTruthy();

    const googleHandlers = google.route.stack.map((s: any) => s.handle?.name);
    const callbackHandlers = googleCallback.route.stack.map(
      (s: any) => s.handle?.name
    );

    expect(googleHandlers).not.toContain("csrf");
    expect(callbackHandlers).not.toContain("csrf");
  });
});
