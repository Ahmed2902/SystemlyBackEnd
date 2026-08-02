import { Roles, SubscriptionStatus } from "@prisma/client";
import cron from "node-cron";
import { prisma } from "../shared/db/prisma";
import { enqueueTrialExpiredEmail } from "../shared/services/email.service";
import { addExactDays } from "../modules/subscriptions/subscription.service";

const INTERVAL_HOURS = 1;

type TrialWithContext = Awaited<ReturnType<typeof loadTrialWindow>>[number];

function loadTrialWindow(from: Date, to: Date, notifiedField: "three" | "one") {
  return prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: { gt: from, lte: to },
      ...(notifiedField === "three"
        ? { trialNotified3Days: false }
        : { trialNotified1Day: false }),
    },
    include: { business: true, plan: true },
  });
}

async function ownerForBusiness(businessId: string | null) {
  if (!businessId) return null;
  return prisma.businessUser.findFirst({
    where: { businessId, role: Roles.BusinessAdmin },
    orderBy: { createdAt: "asc" },
  });
}

async function queueTrialNotice(
  subscription: TrialWithContext,
  details: { daysLeft?: number; expiredAt?: string },
) {
  if (!subscription.trialEndsAt) return;
  const owner = await ownerForBusiness(subscription.businessId);
  if (!owner?.email) return;

  await enqueueTrialExpiredEmail(
    { name: owner.name, email: owner.email },
    {
      businessName: subscription.business?.name || "",
      planName: subscription.plan.name,
      trialEnd: subscription.trialEndsAt.toISOString(),
      ...details,
    },
  );
}

export async function processSubscriptionCycle(now = new Date()) {
  const oneDayFromNow = addExactDays(now, 1);
  const threeDaysFromNow = addExactDays(now, 3);

  const threeDayTrials = await loadTrialWindow(
    oneDayFromNow,
    threeDaysFromNow,
    "three",
  );
  for (const subscription of threeDayTrials) {
    try {
      await queueTrialNotice(subscription, { daysLeft: 3 });
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { trialNotified3Days: true },
      });
    } catch (error) {
      console.error(
        "[SubscriptionJob] Failed three-day trial notice",
        subscription.id,
        error,
      );
    }
  }

  const oneDayTrials = await loadTrialWindow(now, oneDayFromNow, "one");
  for (const subscription of oneDayTrials) {
    try {
      await queueTrialNotice(subscription, { daysLeft: 1 });
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { trialNotified1Day: true },
      });
    } catch (error) {
      console.error(
        "[SubscriptionJob] Failed one-day trial notice",
        subscription.id,
        error,
      );
    }
  }

  const expiredTrials = await prisma.subscription.findMany({
    where: {
      status: SubscriptionStatus.TRIALING,
      trialEndsAt: { lte: now },
      expiredHandled: false,
    },
    include: { business: true, plan: true },
  });

  for (const subscription of expiredTrials) {
    try {
      await queueTrialNotice(subscription, {
        expiredAt: subscription.trialEndsAt?.toISOString(),
      });
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.EXPIRED,
          endedAt: subscription.trialEndsAt ?? now,
          expiredHandled: true,
        },
      });
    } catch (error) {
      console.error(
        "[SubscriptionJob] Failed expired-trial processing",
        subscription.id,
        error,
      );
    }
  }
}

const register = () => {
  void processSubscriptionCycle();
  cron.schedule(`0 */${INTERVAL_HOURS} * * *`, () => {
    void processSubscriptionCycle();
  });
  console.log(
    "[SubscriptionJob] Registered - runs every",
    INTERVAL_HOURS,
    "hour(s)",
  );
};

export default { register };
