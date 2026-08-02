import {
  BillingInterval,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { PLAN_CODES } from "../subscriptions/subscription.catalog";
import { getBusinessSubscription } from "../subscriptions/subscription.service";

async function checkoutPlan(planId?: string) {
  const plan = await prisma.plan.findFirst({
    where: planId
      ? { id: planId, isActive: true, isPublic: true }
      : { code: PLAN_CODES.CORE, isActive: true, isPublic: true },
    include: {
      prices: {
        where: { isActive: true, interval: BillingInterval.MONTHLY },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!plan) {
    const error = new Error("Subscription plan not found") as Error & {
      statusCode?: number;
      code?: string;
    };
    error.statusCode = 404;
    error.code = "PLAN_NOT_FOUND";
    throw error;
  }

  const price = plan.prices?.[0] ?? null;
  return {
    plan,
    price,
  };
}

class BillingService {
  findSubscription(businessId: string) {
    return getBusinessSubscription(businessId);
  }

  async createCheckout(businessId: string, planId?: string) {
    const selected = await checkoutPlan(planId);
    const subscription = await prisma.subscription.upsert({
      where: { businessId },
      create: {
        businessId,
        planId: selected.plan.id,
        priceId: selected.price?.id ?? null,
        status: SubscriptionStatus.INCOMPLETE,
      },
      update: {
        planId: selected.plan.id,
        priceId: selected.price?.id ?? null,
      },
    });

    return { subscription };
  }
}

const billingService = new BillingService();
export default billingService;

export const findSubscription =
  billingService.findSubscription.bind(billingService);
export const createCheckout =
  billingService.createCheckout.bind(billingService);
