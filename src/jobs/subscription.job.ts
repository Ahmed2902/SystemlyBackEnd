import {
  Prisma,
  Roles,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
} from "@prisma/client";
import cron from "node-cron";
import { prisma } from "../shared/db/prisma";
import {
  addExactDays,
  GRACE_PERIOD_DAYS,
} from "../modules/subscriptions/subscription.service";
import {
  subscriptionNotifier,
  type SubscriptionNoticeSubtype,
  type SubscriptionNotifier,
} from "../modules/subscriptions/subscription-notification.service";

const INTERVAL_HOURS = 1;
const SUBSCRIPTION_CYCLE_LOCK_ID = 2_026_080_2;
const ONE_HOUR_MS = 60 * 60 * 1000;

const subscriptionContextInclude = {
  business: true,
  plan: true,
} satisfies Prisma.SubscriptionInclude;

type SubscriptionWithContext = Prisma.SubscriptionGetPayload<{
  include: typeof subscriptionContextInclude;
}>;

export interface SubscriptionCycleSummary {
  acquired: boolean;
  trialNotices3Days: number;
  trialNotices1Day: number;
  renewalNotices3Days: number;
  renewalNotices1Day: number;
  expiredTrials: number;
  startedGracePeriods: number;
  expiredGracePeriods: number;
  completedCancellations: number;
  expiredPayments: number;
}

function emptySummary(acquired: boolean): SubscriptionCycleSummary {
  return {
    acquired,
    trialNotices3Days: 0,
    trialNotices1Day: 0,
    renewalNotices3Days: 0,
    renewalNotices1Day: 0,
    expiredTrials: 0,
    startedGracePeriods: 0,
    expiredGracePeriods: 0,
    completedCancellations: 0,
    expiredPayments: 0,
  };
}

function oneHourBefore(value: Date) {
  return new Date(value.getTime() - ONE_HOUR_MS);
}

async function ownerForBusiness(
  tx: Prisma.TransactionClient,
  businessId: string | null,
) {
  if (!businessId) return null;
  return tx.businessUser.findFirst({
    where: { businessId, role: Roles.BusinessAdmin },
    orderBy: { createdAt: "asc" },
    select: {
      name: true,
      email: true,
      preferredLanguage: true,
    },
  });
}

async function sendNotice(
  tx: Prisma.TransactionClient,
  notifier: SubscriptionNotifier,
  subscription: SubscriptionWithContext,
  subtype: SubscriptionNoticeSubtype,
  idempotencyKey: string,
  details: {
    trialEnd?: string;
    daysLeft?: number;
    expiredAt?: string;
    periodEnd?: string;
    graceEnd?: string;
  } = {},
) {
  if (!subscription.businessId || !subscription.business) return false;
  const owner = await ownerForBusiness(tx, subscription.businessId);
  if (!owner?.email) return false;

  await notifier.send({
    idempotencyKey,
    subtype,
    owner,
    businessId: subscription.businessId,
    businessName: subscription.business.name,
    planName: subscription.plan.name,
    ...details,
  });
  return true;
}

async function processTrialNotices(
  tx: Prisma.TransactionClient,
  notifier: SubscriptionNotifier,
  now: Date,
  summary: SubscriptionCycleSummary,
) {
  const oneDayFromNow = addExactDays(now, 1);
  const threeDaysFromNow = addExactDays(now, 3);

  const threeDayTrials = await tx.subscription.findMany({
    where: {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: { gt: oneDayFromNow, lte: threeDaysFromNow },
      trialNotified3Days: false,
    },
    include: subscriptionContextInclude,
  });
  for (const subscription of threeDayTrials) {
    const trialEnd = subscription.trialEndsAt?.toISOString();
    await sendNotice(
      tx,
      notifier,
      subscription,
      "trial_ending",
      `subscription:${subscription.id}:trial-ending:3:${trialEnd ?? "unknown"}`,
      { daysLeft: 3, trialEnd },
    );
    await tx.subscription.update({
      where: { id: subscription.id },
      data: { trialNotified3Days: true },
    });
    summary.trialNotices3Days += 1;
  }

  const oneDayTrials = await tx.subscription.findMany({
    where: {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: { gt: now, lte: oneDayFromNow },
      trialNotified1Day: false,
    },
    include: subscriptionContextInclude,
  });
  for (const subscription of oneDayTrials) {
    const trialEnd = subscription.trialEndsAt?.toISOString();
    await sendNotice(
      tx,
      notifier,
      subscription,
      "trial_ending",
      `subscription:${subscription.id}:trial-ending:1:${trialEnd ?? "unknown"}`,
      { daysLeft: 1, trialEnd },
    );
    await tx.subscription.update({
      where: { id: subscription.id },
      data: { trialNotified1Day: true },
    });
    summary.trialNotices1Day += 1;
  }
}

async function processRenewalNotices(
  tx: Prisma.TransactionClient,
  notifier: SubscriptionNotifier,
  now: Date,
  summary: SubscriptionCycleSummary,
) {
  for (const daysLeft of [3, 1] as const) {
    const target = addExactDays(now, daysLeft);
    const subscriptions = await tx.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: {
          gt: oneHourBefore(target),
          lte: target,
        },
      },
      include: subscriptionContextInclude,
    });

    for (const subscription of subscriptions) {
      const periodEnd = subscription.currentPeriodEnd?.toISOString();
      await sendNotice(
        tx,
        notifier,
        subscription,
        "subscription_renewal_ending",
        `subscription:${subscription.id}:renewal-ending:${daysLeft}:${periodEnd ?? "unknown"}`,
        { daysLeft, periodEnd },
      );
      if (daysLeft === 3) summary.renewalNotices3Days += 1;
      else summary.renewalNotices1Day += 1;
    }
  }
}

async function processExpiredTrials(
  tx: Prisma.TransactionClient,
  notifier: SubscriptionNotifier,
  now: Date,
  summary: SubscriptionCycleSummary,
) {
  const subscriptions = await tx.subscription.findMany({
    where: {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: { lte: now },
      expiredHandled: false,
    },
    include: subscriptionContextInclude,
  });

  for (const subscription of subscriptions) {
    const expiredAt = (subscription.trialEndsAt ?? now).toISOString();
    await sendNotice(
      tx,
      notifier,
      subscription,
      "trial_expired",
      `subscription:${subscription.id}:trial-expired:${expiredAt}`,
      { expiredAt },
    );
    const updated = await tx.subscription.updateMany({
      where: {
        id: subscription.id,
        status: SubscriptionStatus.TRIALING,
        expiredHandled: false,
      },
      data: {
        status: SubscriptionStatus.EXPIRED,
        endedAt: subscription.trialEndsAt ?? now,
        expiredHandled: true,
      },
    });
    summary.expiredTrials += updated.count;
  }
}

async function processCompletedCancellations(
  tx: Prisma.TransactionClient,
  notifier: SubscriptionNotifier,
  now: Date,
  summary: SubscriptionCycleSummary,
) {
  const subscriptions = await tx.subscription.findMany({
    where: {
      status: {
        in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE],
      },
      cancelAtPeriodEnd: true,
      currentPeriodEnd: { lte: now },
    },
    include: subscriptionContextInclude,
  });

  for (const subscription of subscriptions) {
    const endedAt = subscription.currentPeriodEnd ?? now;
    await sendNotice(
      tx,
      notifier,
      subscription,
      "subscription_canceled",
      `subscription:${subscription.id}:canceled:${endedAt.toISOString()}`,
      { expiredAt: endedAt.toISOString() },
    );
    const updated = await tx.subscription.updateMany({
      where: {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: true,
      },
      data: {
        status: SubscriptionStatus.CANCELED,
        endedAt,
        graceEndsAt: null,
        expiredHandled: true,
      },
    });
    summary.completedCancellations += updated.count;
  }
}

async function processEndedPaidPeriods(
  tx: Prisma.TransactionClient,
  notifier: SubscriptionNotifier,
  now: Date,
  summary: SubscriptionCycleSummary,
) {
  const subscriptions = await tx.subscription.findMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { lte: now },
    },
    include: subscriptionContextInclude,
  });

  for (const subscription of subscriptions) {
    const periodEnd = subscription.currentPeriodEnd ?? now;
    const graceEndsAt = addExactDays(periodEnd, GRACE_PERIOD_DAYS);
    await sendNotice(
      tx,
      notifier,
      subscription,
      "subscription_payment_failed",
      `subscription:${subscription.id}:past-due:${periodEnd.toISOString()}`,
      {
        periodEnd: periodEnd.toISOString(),
        graceEnd: graceEndsAt.toISOString(),
      },
    );
    const updated = await tx.subscription.updateMany({
      where: {
        id: subscription.id,
        status: SubscriptionStatus.ACTIVE,
        cancelAtPeriodEnd: false,
      },
      data: {
        status: SubscriptionStatus.PAST_DUE,
        graceEndsAt,
        endedAt: null,
        expiredHandled: false,
      },
    });
    summary.startedGracePeriods += updated.count;
  }
}

async function processExpiredGracePeriods(
  tx: Prisma.TransactionClient,
  notifier: SubscriptionNotifier,
  now: Date,
  summary: SubscriptionCycleSummary,
) {
  const subscriptions = await tx.subscription.findMany({
    where: {
      status: SubscriptionStatus.PAST_DUE,
      graceEndsAt: { lte: now },
    },
    include: subscriptionContextInclude,
  });

  for (const subscription of subscriptions) {
    const expiredAt = subscription.graceEndsAt ?? now;
    await sendNotice(
      tx,
      notifier,
      subscription,
      "subscription_expired",
      `subscription:${subscription.id}:expired:${expiredAt.toISOString()}`,
      { expiredAt: expiredAt.toISOString() },
    );
    const updated = await tx.subscription.updateMany({
      where: {
        id: subscription.id,
        status: SubscriptionStatus.PAST_DUE,
        graceEndsAt: { lte: now },
      },
      data: {
        status: SubscriptionStatus.EXPIRED,
        endedAt: expiredAt,
        expiredHandled: true,
      },
    });
    summary.expiredGracePeriods += updated.count;
  }
}

async function expireAbandonedPayments(
  tx: Prisma.TransactionClient,
  now: Date,
  summary: SubscriptionCycleSummary,
) {
  const result = await tx.subscriptionPayment.updateMany({
    where: {
      status: {
        in: [
          SubscriptionPaymentStatus.PENDING,
          SubscriptionPaymentStatus.REQUIRES_ACTION,
        ],
      },
      expiresAt: { lte: now },
    },
    data: {
      status: SubscriptionPaymentStatus.EXPIRED,
      checkoutUrl: null,
      failureCode: "CHECKOUT_EXPIRED",
      failureReason: "The hosted checkout expired before payment was confirmed.",
    },
  });
  summary.expiredPayments = result.count;
}

async function runCycle(
  tx: Prisma.TransactionClient,
  notifier: SubscriptionNotifier,
  now: Date,
) {
  const summary = emptySummary(true);
  await processTrialNotices(tx, notifier, now, summary);
  await processRenewalNotices(tx, notifier, now, summary);
  await processExpiredTrials(tx, notifier, now, summary);
  await processCompletedCancellations(tx, notifier, now, summary);
  await processEndedPaidPeriods(tx, notifier, now, summary);
  await processExpiredGracePeriods(tx, notifier, now, summary);
  await expireAbandonedPayments(tx, now, summary);
  return summary;
}

export async function processSubscriptionCycle(
  now = new Date(),
  notifier: SubscriptionNotifier = subscriptionNotifier,
  database: typeof prisma = prisma,
): Promise<SubscriptionCycleSummary> {
  return database.$transaction(
    async (tx) => {
      const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${SUBSCRIPTION_CYCLE_LOCK_ID}) AS acquired
      `;
      if (!lock?.acquired) return emptySummary(false);
      return runCycle(tx, notifier, now);
    },
    {
      maxWait: 5_000,
      timeout: 60_000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    },
  );
}

const register = () => {
  void processSubscriptionCycle().catch((error) => {
    console.error("[SubscriptionJob] Initial cycle failed", error);
  });
  cron.schedule(`0 */${INTERVAL_HOURS} * * *`, () => {
    void processSubscriptionCycle().catch((error) => {
      console.error("[SubscriptionJob] Scheduled cycle failed", error);
    });
  });
  console.log(
    "[SubscriptionJob] Registered - runs every",
    INTERVAL_HOURS,
    "hour(s)",
  );
};

export default { register };
