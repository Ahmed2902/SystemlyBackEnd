import { prisma } from "../../shared/db/prisma";
import { sendTrialStartedEmail } from "../../shared/services/email.service";

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
    void sendTrialStartedEmail({ name: user.name, email: user.email }, {
      businessName: (await prisma.business.findUnique({ where: { id: businessId } }))?.name || "",
      planName: plan.name,
      trialEnd: periodEnd.toISOString(),
    });
  }

  return sub;
};

export const findSubscription = async (businessId: string) => {
  return prisma.subscription.findUnique({ where: { businessId } });
};

export default { startTrial, findSubscription };
