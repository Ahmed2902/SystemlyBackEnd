import {
  BillingInterval,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { CORE_PLAN } from "./subscription.catalog";

export async function activatePlanPrice(
  tx: Prisma.TransactionClient,
  input: {
    planId: string;
    amountCents: number;
    currency: string;
    interval: BillingInterval;
  },
) {
  const candidate = await tx.planPrice.upsert({
    where: {
      planId_amountCents_currency_interval: input,
    },
    create: {
      ...input,
      isActive: false,
    },
    update: {},
  });

  await tx.planPrice.updateMany({
    where: {
      planId: input.planId,
      currency: input.currency,
      interval: input.interval,
      isActive: true,
      id: { not: candidate.id },
    },
    data: { isActive: false },
  });

  return tx.planPrice.update({
    where: { id: candidate.id },
    data: { isActive: true },
  });
}

export async function ensureCorePlan(client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    const plan = await tx.plan.upsert({
      where: { code: CORE_PLAN.code },
      create: {
        code: CORE_PLAN.code,
        name: CORE_PLAN.name,
        description: CORE_PLAN.description,
        isActive: true,
        isPublic: true,
        sortOrder: CORE_PLAN.sortOrder,
      },
      update: {
        name: CORE_PLAN.name,
        description: CORE_PLAN.description,
        isActive: true,
        isPublic: true,
        sortOrder: CORE_PLAN.sortOrder,
      },
    });

    const price = await activatePlanPrice(tx, {
      planId: plan.id,
      amountCents: CORE_PLAN.monthlyPriceCents,
      currency: CORE_PLAN.currency,
      interval: BillingInterval.MONTHLY,
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
