import cron from "node-cron";
import dayjs from "dayjs";
import { prisma } from "../shared/db/prisma";
import { enqueueTrialExpiredEmail } from "../shared/services/email.service";

const INTERVAL_HOURS = 1; // run hourly to pick up near-expiry trials

const processCycle = async () => {
  try {
    const now = dayjs();

    // 3 days before
    const in3 = now.add(3, "day");
    const subs3 = await prisma.subscription.findMany({
      where: {
        status: "trialing",
        currentPeriodEnd: { gte: now.toDate(), lte: in3.toDate() },
        trialNotified3Days: false,
      },
      include: { business: true },
    });

    for (const s of subs3) {
      try {
        const user = await prisma.businessUser.findFirst({
          where: { businessId: s.businessId },
        });
        if (user && user.email) {
          await enqueueTrialExpiredEmail(
            { name: user.name, email: user.email },
            {
              businessName: s.business?.name || "",
              planName:
                (await prisma.plan.findUnique({ where: { id: s.planId } }))
                  ?.name || "",
              trialEnd: s.currentPeriodEnd.toISOString(),
              daysLeft: 3,
            },
          );
        }
        await prisma.subscription.update({
          where: { id: s.id },
          data: { trialNotified3Days: true },
        });
      } catch (err) {
        // log and continue
        // eslint-disable-next-line no-console
        console.error(
          "[SubscriptionJob] Error notifying 3-day trial for",
          s.id,
          err,
        );
      }
    }

    // 1 day before
    const in1 = now.add(1, "day");
    const subs1 = await prisma.subscription.findMany({
      where: {
        status: "trialing",
        currentPeriodEnd: { gte: now.toDate(), lte: in1.toDate() },
        trialNotified1Day: false,
      },
      include: { business: true },
    });

    for (const s of subs1) {
      try {
        const user = await prisma.businessUser.findFirst({
          where: { businessId: s.businessId },
        });
        if (user && user.email) {
          await enqueueTrialExpiredEmail(
            { name: user.name, email: user.email },
            {
              businessName: s.business?.name || "",
              planName:
                (await prisma.plan.findUnique({ where: { id: s.planId } }))
                  ?.name || "",
              trialEnd: s.currentPeriodEnd.toISOString(),
              daysLeft: 1,
            },
          );
        }
        await prisma.subscription.update({
          where: { id: s.id },
          data: { trialNotified1Day: true },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          "[SubscriptionJob] Error notifying 1-day trial for",
          s.id,
          err,
        );
      }
    }

    // expired
    const expired = await prisma.subscription.findMany({
      where: {
        status: "trialing",
        currentPeriodEnd: { lte: now.toDate() },
        expiredHandled: false,
      },
      include: { business: true },
    });

    for (const s of expired) {
      try {
        const user = await prisma.businessUser.findFirst({
          where: { businessId: s.businessId },
        });
        if (user && user.email) {
          await enqueueTrialExpiredEmail(
            { name: user.name, email: user.email },
            {
              businessName: s.business?.name || "",
              planName:
                (await prisma.plan.findUnique({ where: { id: s.planId } }))
                  ?.name || "",
              expiredAt: s.currentPeriodEnd.toISOString(),
            },
          );
        }
        await prisma.subscription.update({
          where: { id: s.id },
          data: { status: "expired", expiredHandled: true },
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          "[SubscriptionJob] Error handling expired trial for",
          s.id,
          err,
        );
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[SubscriptionJob] Cycle error", err);
  }
};

const register = () => {
  void processCycle();
  // run hourly
  cron.schedule(`0 */${INTERVAL_HOURS} * * *`, () => {
    void processCycle();
  });
  // eslint-disable-next-line no-console
  console.log(
    "[SubscriptionJob] Registered - runs every",
    INTERVAL_HOURS,
    "hour(s)",
  );
};

export default { register };
