import { BillingInterval } from "@prisma/client";
import { prisma } from "../src/shared/db/prisma";
import {
  CORE_PLAN,
  ENTITLEMENTS,
  PLAN_CODES,
} from "../src/modules/subscriptions/subscription.catalog";
import { ensureCorePlan } from "../src/modules/subscriptions/subscription.seed";

describe("subscription plan foundation", () => {
  test("defines unique Core entitlements without WhatsApp access", () => {
    expect(new Set(CORE_PLAN.entitlements).size).toBe(
      CORE_PLAN.entitlements.length,
    );
    expect(CORE_PLAN.entitlements).not.toContain(ENTITLEMENTS.WHATSAPP_AI);
    expect(CORE_PLAN.monthlyPriceCents).toBe(79_900);
  });

  test("seeds Core, its monthly price, and entitlements idempotently", async () => {
    await ensureCorePlan();
    await ensureCorePlan();

    const plan = await prisma.plan.findUnique({
      where: { code: PLAN_CODES.CORE },
      include: {
        prices: { where: { isActive: true } },
        entitlements: { where: { enabled: true } },
      },
    });

    expect(plan).not.toBeNull();
    expect(plan?.name).toBe(CORE_PLAN.name);
    expect(plan?.prices).toEqual([
      expect.objectContaining({
        amountCents: CORE_PLAN.monthlyPriceCents,
        currency: CORE_PLAN.currency,
        interval: BillingInterval.MONTHLY,
      }),
    ]);
    expect(plan?.entitlements.map((entry) => entry.key).sort()).toEqual(
      [...CORE_PLAN.entitlements].sort(),
    );
  });
});
