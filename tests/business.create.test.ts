import businessRoutes from "../src/modules/business/business.routes";

describe("business creation route", () => {
  test("POST /businesses exists and requires auth + body validation", () => {
    const router: any = businessRoutes as any;
    const stack: any[] = router.stack || [];

    const layer = stack.find(
      (l) => l?.route?.path === "/" && l?.route?.methods?.post
    );

    expect(layer).toBeTruthy();

    const handlers = layer.route.stack.map((s: any) => s.handle);
    const handlerNames = handlers.map((h: any) => h?.name);

    expect(handlerNames).toContain("requireAuth");

    const hasBodyValidation = handlers.some(
      (h: any) => h?.__validationTarget === "body"
    );
    expect(hasBodyValidation).toBe(true);
  });
});

