import {
  BillingInterval,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import {
  enqueueSubscriptionActivatedEmail,
  enqueueSubscriptionPaymentFailedEmail,
} from "../../shared/services/email.service";
import { PLAN_CODES } from "../subscriptions/subscription.catalog";
import {
  addCalendarMonth,
  addExactDays,
  getBusinessSubscription,
  GRACE_PERIOD_DAYS,
} from "../subscriptions/subscription.service";
import paymob from "./paymob";

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

  // The fallback keeps the legacy Paymob checkout and its isolated unit mocks
  // deployable while PlanPrice becomes the authoritative source.
  const price = plan.prices?.[0] ?? null;
  return {
    plan,
    price,
    amountCents: price?.amountCents ?? Math.round(Number(plan.priceEgp) * 100),
    currency: price?.currency ?? "EGP",
  };
}

class BillingService {
  findSubscription(businessId: string) {
    return getBusinessSubscription(businessId);
  }

  async createCheckout(businessId: string, planId?: string) {
    const selected = await checkoutPlan(planId);
    const existing = await prisma.subscription.findUnique({
      where: { businessId },
    });

    const subscription = existing
      ? await prisma.subscription.update({
          where: { id: existing.id },
          data: {
            planId: selected.plan.id,
            priceId: selected.price?.id ?? null,
          },
        })
      : await prisma.subscription.create({
          data: {
            businessId,
            planId: selected.plan.id,
            priceId: selected.price?.id ?? null,
            status: SubscriptionStatus.INCOMPLETE,
          },
        });

    const order = await paymob.createPaymobOrder(
      selected.amountCents,
      selected.currency,
      `Subscription ${selected.plan.name} for ${businessId}`,
    );

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { paymobSubscriptionId: order.orderId },
    });

    try {
      const businessUser = await prisma.businessUser.findFirst({
        where: { businessId },
      });
      const billingData = {
        email: businessUser?.email || "",
        first_name: businessUser?.name || undefined,
        phone_number: businessUser?.phone || undefined,
        city: undefined,
        country: undefined,
        apartment: undefined,
        floor: undefined,
        street: undefined,
        building: undefined,
        state: undefined,
        postal_code: undefined,
      };

      const paymentKey = await paymob.createPaymentKey(
        order.orderId,
        selected.amountCents,
        billingData as any,
      );

      return {
        subscription,
        payment: { ...order, paymentKey },
      };
    } catch (error) {
      console.warn("[Billing] Failed to create Paymob payment key", error);
      return { subscription, payment: order };
    }
  }

  async handlePaymobPayload(payload: any) {
    const id =
      payload.orderId ||
      payload.data?.order_id ||
      payload.data?.id ||
      payload.id ||
      payload.order_id;
    if (!id) return { handled: false };

    const subscription = await prisma.subscription.findFirst({
      where: { paymobSubscriptionId: id },
      include: { business: true, plan: true },
    });
    if (!subscription) return { handled: false };

    const providerStatus = (
      payload.status ||
      payload.event ||
      payload.data?.status ||
      ""
    ).toLowerCase();
    const now = new Date();

    if (
      providerStatus.includes("paid") ||
      providerStatus.includes("successful")
    ) {
      const periodEnd = addCalendarMonth(now);
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          graceEndsAt: null,
          endedAt: null,
          expiredHandled: false,
        },
      });

      const user = await prisma.businessUser.findFirst({
        where: { businessId: subscription.businessId },
      });
      if (user?.email) {
        void enqueueSubscriptionActivatedEmail(
          { name: user.name, email: user.email },
          {
            businessName: subscription.business?.name || "",
            planName: subscription.plan.name,
            periodEnd: periodEnd.toISOString(),
          },
        ).catch((error) => {
          console.error("[Billing] Failed to queue activation email", error);
        });
      }
      return { handled: true };
    }

    if (
      providerStatus.includes("failed") ||
      providerStatus.includes("declined") ||
      providerStatus.includes("past_due")
    ) {
      const trialStillActive =
        subscription.status === SubscriptionStatus.TRIALING &&
        Boolean(subscription.trialEndsAt && subscription.trialEndsAt > now);

      if (!trialStillActive) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.PAST_DUE,
            graceEndsAt: addExactDays(now, GRACE_PERIOD_DAYS),
          },
        });
      }

      const user = await prisma.businessUser.findFirst({
        where: { businessId: subscription.businessId },
      });
      if (user?.email) {
        void enqueueSubscriptionPaymentFailedEmail(
          { name: user.name, email: user.email },
          {
            businessName: subscription.business?.name || "",
            planName: subscription.plan.name,
          },
        ).catch((error) => {
          console.error("[Billing] Failed to queue payment failure email", error);
        });
      }
      return { handled: true };
    }

    return { handled: false };
  }
}

const billingService = new BillingService();
export default billingService;

export const findSubscription =
  billingService.findSubscription.bind(billingService);
export const createCheckout =
  billingService.createCheckout.bind(billingService);
export const handlePaymobPayload =
  billingService.handlePaymobPayload.bind(billingService);
