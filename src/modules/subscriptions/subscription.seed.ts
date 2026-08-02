import { BillingInterval, PrismaClient } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { CORE_PLAN } from "./subscription.catalog";

export async function ensureCorePlan(client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    const plan = await tx.plan.upsert({
      where: { code: CORE_PLAN.code },
      create: {
        code: CORE_PLAN.code,
        name: CORE_PLAN.name,
        description: CORE_PLAN.description,
        priceEgp: CORE_PLAN.monthlyPriceCents / 100,
        isActive: true,
        isPublic: true,
        sortOrder: CORE_PLAN.sortOrder,
      },
      update: {
        name: CORE_PLAN.name,
        description: CORE_PLAN.description,
        priceEgp: CORE_PLAN.monthlyPriceCents / 100,
        isActive: true,
        isPublic: true,
        sortOrder: CORE_PLAN.sortOrder,
      },
    });

    await tx.planPrice.updateMany({
      where: {
        planId: plan.id,
        OR: [
          { amountCents: { not: CORE_PLAN.monthlyPriceCents } },
          { currency: { not: CORE_PLAN.currency } },
          { interval: { not: BillingInterval.MONTHLY } },
        ],
      },
      data: { isActive: false },
    });

    const price = await tx.planPrice.upsert({
      where: {
        planId_amountCents_currency_interval: {
          planId: plan.id,
          amountCents: CORE_PLAN.monthlyPriceCents,
          currency: CORE_PLAN.currency,
          interval: BillingInterval.MONTHLY,
        },
      },
      create: {
        planId: plan.id,
        amountCents: CORE_PLAN.monthlyPriceCents,
        currency: CORE_PLAN.currency,
        interval: BillingInterval.MONTHLY,
        isActive: true,
      },
      update: { isActive: true },
    });

    await Promise.all(
      CORE_PLAN.entitlements.map((key) =>
        tx.planEntitlement.upsert({
          where: { planId_key: { planId: plan.id, key } },
          create: { planId: plan.id, key, enabled: true },
          update: { enabled: true, limit: null },
        }),
      ),
    );

    return { plan, price };
  });
}
