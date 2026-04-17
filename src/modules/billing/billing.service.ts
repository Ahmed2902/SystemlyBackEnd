import { prisma } from "../../shared/db/prisma";
import {
  sendTrialStartedEmail,
  sendSubscriptionActivatedEmail,
  sendSubscriptionPaymentFailedEmail,
} from "../../shared/services/email.service";
import paymob from "./paymob";

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export const startTrial = async (businessId: string, planId?: string) => {
  // pick plan: provided or default Starter
  let plan = null as any;
  if (planId) {
    plan = await prisma.plan.findUnique({ where: { id: planId } });
  }
  if (!plan) {
    plan = await prisma.plan.findFirst({ where: { name: "Starter" } });
  }
  if (!plan) throw new Error("Plan not found");

  const now = new Date();
  const periodEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const sub = await prisma.subscription.create({
    data: {
      businessId,
      planId: plan.id,
      status: "trialing",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  // send trial started email to primary business user (if any)
  const user = await prisma.businessUser.findFirst({ where: { businessId } });
  if (user && user.email) {
    void sendTrialStartedEmail(
      { name: user.name, email: user.email },
      {
        businessName:
          (await prisma.business.findUnique({ where: { id: businessId } }))
            ?.name || "",
        planName: plan.name,
        trialEnd: periodEnd.toISOString(),
      }
    );
  }

  return sub;
};

export const findSubscription = async (businessId: string) => {
  return prisma.subscription.findUnique({ where: { businessId } });
};

export const createCheckout = async (businessId: string, planId?: string) => {
  let plan = null as any;
  if (planId) plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) plan = await prisma.plan.findFirst({ where: { name: "Starter" } });
  if (!plan) throw new Error("Plan not found");

  const amountCents = Math.round(Number(plan.priceEgp) * 100);

  // create or update subscription to pending
  const now = new Date();
  const sub = await prisma.subscription.upsert({
    where: { businessId },
    create: {
      businessId,
      planId: plan.id,
      status: "pending",
      currentPeriodStart: now,
      currentPeriodEnd: now,
    },
    update: {
      planId: plan.id,
      status: "pending",
      updatedAt: now,
    },
  });

  const order = await paymob.createPaymobOrder(
    amountCents,
    "EGP",
    `Subscription ${plan.name} for ${businessId}`
  );

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { paymobSubscriptionId: order.orderId },
  });

  // attempt to create a payment key (used by frontend to open Paymob checkout)
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
      amountCents,
      billingData as any
    );

    return { subscription: sub, payment: { ...order, paymentKey } };
  } catch (err) {
    // If payment key creation fails, still return the order info so frontend can handle fallback
    // eslint-disable-next-line no-console
    console.warn("[Billing] Failed to create Paymob payment key", err);
    return { subscription: sub, payment: order };
  }
};

export const handlePaymobPayload = async (payload: any) => {
  // payload shape depends on Paymob; be defensive
  const id =
    payload.orderId ||
    payload.data?.order_id ||
    payload.data?.id ||
    payload.id ||
    payload.order_id;
  if (!id) return { handled: false };

  const sub = await prisma.subscription.findFirst({
    where: { paymobSubscriptionId: id },
  });
  if (!sub) return { handled: false };

  const status = (
    payload.status ||
    payload.event ||
    payload.data?.status ||
    ""
  ).toLowerCase();
  const now = new Date();

  if (status.includes("paid") || status.includes("successful")) {
    const periodEnd = new Date(now.getTime() + MONTH_MS);
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });
    // notify
    const user = await prisma.businessUser.findFirst({
      where: { businessId: sub.businessId },
    });
    if (user && user.email) {
      const business = sub.businessId
        ? await prisma.business.findUnique({ where: { id: sub.businessId } })
        : null;
      const planObj = sub.planId
        ? await prisma.plan.findUnique({ where: { id: sub.planId } })
        : null;
      void sendSubscriptionActivatedEmail(
        { name: user.name, email: user.email },
        {
          businessName: business?.name || "",
          planName: planObj?.name || "",
          periodEnd: periodEnd.toISOString(),
        }
      );
    }
    return { handled: true };
  }

  if (
    status.includes("failed") ||
    status.includes("declined") ||
    status.includes("past_due")
  ) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "past_due" },
    });
    const user = await prisma.businessUser.findFirst({
      where: { businessId: sub.businessId },
    });
    if (user && user.email) {
      const business = sub.businessId
        ? await prisma.business.findUnique({ where: { id: sub.businessId } })
        : null;
      const planObj = sub.planId
        ? await prisma.plan.findUnique({ where: { id: sub.planId } })
        : null;
      void sendSubscriptionPaymentFailedEmail(
        { name: user.name, email: user.email },
        { businessName: business?.name || "", planName: planObj?.name || "" }
      );
    }
    return { handled: true };
  }

  return { handled: false };
};

export default { startTrial, findSubscription };
