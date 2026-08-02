import { BillingInterval } from "@prisma/client";
import {
  activatePlanPrice,
  ensureCorePlan,
} from "../src/modules/subscriptions/subscription.seed";
import { prisma } from "../src/shared/db/prisma";

const createdPriceIds: string[] = [];

afterEach(async () => {
  if (createdPriceIds.length === 0) return;
  await prisma.planPrice.deleteMany({
    where: { id: { in: createdPriceIds.splice(0) } },
  });
});

describe("plan prices", () => {
  test("Core pricing is read from PlanPrice and seeding is idempotent", async () => {
    const first = await ensureCorePlan();
    const second = await ensureCorePlan();

    expect(second.plan.id).toBe(first.plan.id);
    expect(second.price.id).toBe(first.price.id);
    expect(second.price.amountCents).toBe(79_900);
    expect(second.price.currency).toBe("EGP");
    expect(second.price.interval).toBe(BillingInterval.MONTHLY);
    expect(second.price.isActive).toBe(true);
  });

  test("activating a new monthly EGP price deactivates the previous one", async () => {
    const { plan, price: original } = await ensureCorePlan();
    const replacement = await prisma.$transaction((tx) =>
      activatePlanPrice(tx, {
        planId: plan.id,
        amountCents: 89_900,
        currency: "EGP",
        interval: BillingInterval.MONTHLY,
      }),
    );
    createdPriceIds.push(replacement.id);

    const prices = await prisma.planPrice.findMany({
      where: {
        planId: plan.id,
        currency: "EGP",
        interval: BillingInterval.MONTHLY,
      },
      orderBy: { amountCents: "asc" },
    });

    expect(prices.filter((entry) => entry.isActive)).toEqual([
      expect.objectContaining({ id: replacement.id, amountCents: 89_900 }),
    ]);
    expect(prices.find((entry) => entry.id === original.id)?.isActive).toBe(
      false,
    );

    await ensureCorePlan();
    const restored = await prisma.planPrice.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(restored.isActive).toBe(true);
  });
});
