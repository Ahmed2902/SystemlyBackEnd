import {
  BillingInterval,
  Prisma,
  RenewalMode,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { PLAN_CODES } from "./subscription.catalog";

export const TRIAL_DURATION_DAYS = 14;
export const GRACE_PERIOD_DAYS = 3;

function subscriptionError(
  message: string,
  statusCode: number,
  code: string,
) {
  const error = new Error(message) as Error & {
    statusCode?: number;
    code?: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export function addExactDays(value: Date, days: number) {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addCalendarMonth(value: Date) {
  const result = new Date(value);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return result;
}

export function effectiveSubscriptionStatus(
  subscription: {
    status: SubscriptionStatus;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    graceEndsAt: Date | null;
  },
  now = new Date(),
): SubscriptionStatus {
  if (
    subscription.status === SubscriptionStatus.TRIALING &&
    (!subscription.trialEndsAt || subscription.trialEndsAt <= now)
  ) {
    return SubscriptionStatus.EXPIRED;
  }

  if (
    subscription.status === SubscriptionStatus.ACTIVE &&
    subscription.currentPeriodEnd &&
    subscription.currentPeriodEnd <= now
  ) {
    return SubscriptionStatus.EXPIRED;
  }

  if (
    subscription.status === SubscriptionStatus.PAST_DUE &&
    (!subscription.graceEndsAt || subscription.graceEndsAt <= now)
  ) {
    return SubscriptionStatus.EXPIRED;
  }

  return subscription.status;
}

export async function startLifetimeTrial(
  tx: Prisma.TransactionClient,
  businessId: string,
  now = new Date(),
) {
  const claim = await tx.business.updateMany({
    where: {
      id: businessId,
      deletedAt: null,
      trialUsedAt: null,
      subscription: null,
    },
    data: { trialUsedAt: now },
  });

  if (claim.count !== 1) {
    throw subscriptionError(
      "This business has already used its free trial.",
      409,
      "TRIAL_ALREADY_USED",
    );
  }

  const plan = await tx.plan.findUnique({
    where: { code: PLAN_CODES.CORE },
    include: {
      prices: {
        where: {
          isActive: true,
          interval: BillingInterval.MONTHLY,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!plan || !plan.isActive) {
    throw subscriptionError(
      "The Core subscription plan is not configured.",
      500,
      "SUBSCRIPTION_PLAN_NOT_CONFIGURED",
    );
  }

  const trialEndsAt = addExactDays(now, TRIAL_DURATION_DAYS);
  return tx.subscription.create({
    data: {
      businessId,
      planId: plan.id,
      priceId: null,
      status: SubscriptionStatus.TRIALING,
      renewalMode: RenewalMode.MANUAL,
      trialStartedAt: now,
      trialEndsAt,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      graceEndsAt: null,
    },
    include: { plan: true },
  });
}

export async function getBusinessSubscription(
  businessId: string,
  now = new Date(),
) {
  const subscription = await prisma.subscription.findUnique({
    where: { businessId },
    include: {
      plan: {
        include: {
          entitlements: {
            where: { enabled: true },
            orderBy: { key: "asc" },
          },
        },
      },
      price: true,
    },
  });

  if (!subscription) return null;

  return {
    id: subscription.id,
    status: subscription.status,
    effectiveStatus: effectiveSubscriptionStatus(subscription, now),
    renewalMode: subscription.renewalMode,
    trialStartedAt: subscription.trialStartedAt,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd,
    graceEndsAt: subscription.graceEndsAt,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    canceledAt: subscription.canceledAt,
    endedAt: subscription.endedAt,
    provider: subscription.provider,
    plan: {
      id: subscription.plan.id,
      code: subscription.plan.code,
      name: subscription.plan.name,
      description: subscription.plan.description,
      entitlements: subscription.plan.entitlements.map((entry) => ({
        key: entry.key,
        limit: entry.limit,
      })),
    },
    price: subscription.price
      ? {
          id: subscription.price.id,
          amountCents: subscription.price.amountCents,
          currency: subscription.price.currency,
          interval: subscription.price.interval,
        }
      : null,
  };
}
