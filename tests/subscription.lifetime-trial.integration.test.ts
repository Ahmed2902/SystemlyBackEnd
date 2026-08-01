import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "../src/shared/db/prisma";
import { ensureCorePlan } from "../src/modules/subscriptions/subscription.seed";
import {
  startLifetimeTrial,
  TRIAL_DURATION_DAYS,
} from "../src/modules/subscriptions/subscription.service";

const createdBusinessIds: string[] = [];

async function createBusiness(suffix: string) {
  const business = await prisma.business.create({
    data: {
      name: `Trial Test ${suffix}`,
      slug: `trial-test-${suffix}-${Date.now()}`,
      vertical: "salon",
      phone: "+201000000000",
      isActive: true,
    },
  });
  createdBusinessIds.push(business.id);
  return business;
}

afterEach(async () => {
  if (createdBusinessIds.length === 0) return;
  await prisma.business.deleteMany({
    where: { id: { in: createdBusinessIds.splice(0) } },
  });
});

describe("lifetime onboarding trial", () => {
  beforeAll(async () => {
    await ensureCorePlan();
  });

  test("creates a billing-free Core trial for exactly 14 days", async () => {
    const business = await createBusiness("first");
    const now = new Date("2026-08-02T13:37:42.000Z");

    const trial = await prisma.$transaction((tx) =>
      startLifetimeTrial(tx, business.id, now),
    );
    const persistedBusiness = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });

    expect(persistedBusiness.trialUsedAt?.toISOString()).toBe(
      now.toISOString(),
    );
    expect(trial.status).toBe(SubscriptionStatus.TRIALING);
    expect(trial.plan.code).toBe("CORE");
    expect(trial.trialStartedAt?.toISOString()).toBe(now.toISOString());
    expect(trial.trialEndsAt?.getTime() - now.getTime()).toBe(
      TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(trial.priceId).toBeNull();
    expect(trial.provider).toBeNull();
    expect(trial.providerCustomerId).toBeNull();
    expect(trial.providerSubscriptionId).toBeNull();
    expect(trial.providerPaymentMethodId).toBeNull();
    expect(trial.currentPeriodStart).toBeNull();
    expect(trial.currentPeriodEnd).toBeNull();
  });

  test("rejects every later trial attempt for the same business", async () => {
    const business = await createBusiness("repeat");
    const now = new Date("2026-08-02T10:00:00.000Z");

    await prisma.$transaction((tx) =>
      startLifetimeTrial(tx, business.id, now),
    );

    await expect(
      prisma.$transaction((tx) =>
        startLifetimeTrial(tx, business.id, new Date(now.getTime() + 1000)),
      ),
    ).rejects.toMatchObject({ code: "TRIAL_ALREADY_USED" });

    expect(
      await prisma.subscription.count({ where: { businessId: business.id } }),
    ).toBe(1);
  });

  test("soft deletion never resets trial eligibility", async () => {
    const business = await createBusiness("deleted");
    const usedAt = new Date("2026-07-01T09:00:00.000Z");

    await prisma.business.update({
      where: { id: business.id },
      data: {
        trialUsedAt: usedAt,
        deletedAt: new Date("2026-08-01T09:00:00.000Z"),
      },
    });

    await expect(
      prisma.$transaction((tx) =>
        startLifetimeTrial(tx, business.id, new Date()),
      ),
    ).rejects.toMatchObject({ code: "TRIAL_ALREADY_USED" });

    expect(
      await prisma.subscription.count({ where: { businessId: business.id } }),
    ).toBe(0);
  });

  test("concurrent claims cannot grant two trials", async () => {
    const business = await createBusiness("concurrent");
    const now = new Date("2026-08-02T11:00:00.000Z");

    const attempts = await Promise.allSettled([
      prisma.$transaction((tx) => startLifetimeTrial(tx, business.id, now)),
      prisma.$transaction((tx) => startLifetimeTrial(tx, business.id, now)),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);
    expect(
      await prisma.subscription.count({ where: { businessId: business.id } }),
    ).toBe(1);
  });
});
