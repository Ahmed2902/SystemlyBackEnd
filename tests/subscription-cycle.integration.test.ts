import {
  BillingProvider,
  Roles,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { processSubscriptionCycle } from "../src/jobs/subscription.job";
import type { SubscriptionNotifier } from "../src/modules/subscriptions/subscription-notification.service";
import { ensureCorePlan } from "../src/modules/subscriptions/subscription.seed";
import { prisma } from "../src/shared/db/prisma";

const businessIds: string[] = [];

function notifierMock() {
  return {
    send: jest.fn().mockResolvedValue(undefined),
  } satisfies SubscriptionNotifier;
}

async function subscriptionFixture(
  suffix: string,
  data: {
    status: SubscriptionStatus;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    graceEndsAt?: Date | null;
    trialStartedAt?: Date | null;
    trialEndsAt?: Date | null;
    cancelAtPeriodEnd?: boolean;
  },
) {
  const { plan, price } = await ensureCorePlan();
  const business = await prisma.business.create({
    data: {
      name: `Cycle ${suffix}`,
      slug: `cycle-${suffix}-${Date.now()}-${Math.random()}`,
      vertical: "salon",
      phone: "+201000000000",
      isActive: true,
      trialUsedAt: new Date("2026-01-01T00:00:00.000Z"),
      businessUsers: {
        create: {
          name: "Owner",
          email: `cycle-${suffix}-${Date.now()}-${Math.random()}@example.com`,
          passwordHash: "test-password-hash",
          emailVerified: true,
          role: Roles.BusinessAdmin,
          preferredLanguage: "en",
        },
      },
      subscription: {
        create: {
          planId: plan.id,
          priceId:
            data.status === SubscriptionStatus.TRIALING ? null : price.id,
          status: data.status,
          trialStartedAt: data.trialStartedAt ?? null,
          trialEndsAt: data.trialEndsAt ?? null,
          currentPeriodStart: data.currentPeriodStart ?? null,
          currentPeriodEnd: data.currentPeriodEnd ?? null,
          graceEndsAt: data.graceEndsAt ?? null,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
        },
      },
    },
    include: { subscription: true },
  });
  businessIds.push(business.id);
  if (!business.subscription) throw new Error("Fixture subscription missing");
  return { business, subscription: business.subscription, plan, price };
}

afterEach(async () => {
  if (businessIds.length === 0) return;
  await prisma.business.deleteMany({
    where: { id: { in: businessIds.splice(0) } },
  });
});

describe("subscription lifecycle cycle", () => {
  test("an ended paid period enters grace and expires an abandoned checkout", async () => {
    const now = new Date("2026-09-07T10:00:00.000Z");
    const periodEnd = new Date("2026-09-07T09:30:00.000Z");
    const fixture = await subscriptionFixture("past-due", {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date("2026-08-07T09:30:00.000Z"),
      currentPeriodEnd: periodEnd,
    });
    const payment = await prisma.subscriptionPayment.create({
      data: {
        subscriptionId: fixture.subscription.id,
        planId: fixture.plan.id,
        priceId: fixture.price.id,
        provider: BillingProvider.EASYKASH,
        status: SubscriptionPaymentStatus.REQUIRES_ACTION,
        amountCents: fixture.price.amountCents,
        currency: fixture.price.currency,
        checkoutUrl: "https://checkout.example/expired",
        expiresAt: new Date("2026-09-07T09:45:00.000Z"),
      },
    });
    const notifier = notifierMock();

    const summary = await processSubscriptionCycle(now, notifier);

    const [subscription, updatedPayment] = await Promise.all([
      prisma.subscription.findUniqueOrThrow({
        where: { id: fixture.subscription.id },
      }),
      prisma.subscriptionPayment.findUniqueOrThrow({
        where: { id: payment.id },
      }),
    ]);
    expect(summary.startedGracePeriods).toBe(1);
    expect(summary.expiredPayments).toBe(1);
    expect(subscription.status).toBe(SubscriptionStatus.PAST_DUE);
    expect(subscription.graceEndsAt?.toISOString()).toBe(
      "2026-09-10T09:30:00.000Z",
    );
    expect(updatedPayment.status).toBe(SubscriptionPaymentStatus.EXPIRED);
    expect(updatedPayment.checkoutUrl).toBeNull();
    expect(notifier.send).toHaveBeenCalledWith(
      expect.objectContaining({
        subtype: "subscription_payment_failed",
        businessId: fixture.business.id,
      }),
    );
  });

  test("scheduled cancellation wins over the past-due transition", async () => {
    const now = new Date("2026-09-07T10:00:00.000Z");
    const fixture = await subscriptionFixture("canceled", {
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date("2026-08-07T09:30:00.000Z"),
      currentPeriodEnd: new Date("2026-09-07T09:30:00.000Z"),
      cancelAtPeriodEnd: true,
    });
    const notifier = notifierMock();

    const summary = await processSubscriptionCycle(now, notifier);

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: fixture.subscription.id },
    });
    expect(summary.completedCancellations).toBe(1);
    expect(summary.startedGracePeriods).toBe(0);
    expect(subscription.status).toBe(SubscriptionStatus.CANCELED);
    expect(subscription.graceEndsAt).toBeNull();
    expect(notifier.send).toHaveBeenCalledWith(
      expect.objectContaining({ subtype: "subscription_canceled" }),
    );
  });

  test("an ended grace period becomes expired exactly once", async () => {
    const now = new Date("2026-09-10T10:00:00.000Z");
    const fixture = await subscriptionFixture("expired-grace", {
      status: SubscriptionStatus.PAST_DUE,
      currentPeriodStart: new Date("2026-08-07T09:30:00.000Z"),
      currentPeriodEnd: new Date("2026-09-07T09:30:00.000Z"),
      graceEndsAt: new Date("2026-09-10T09:30:00.000Z"),
    });
    const notifier = notifierMock();

    const first = await processSubscriptionCycle(now, notifier);
    const second = await processSubscriptionCycle(now, notifier);

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: fixture.subscription.id },
    });
    expect(first.expiredGracePeriods).toBe(1);
    expect(second.expiredGracePeriods).toBe(0);
    expect(subscription.status).toBe(SubscriptionStatus.EXPIRED);
    expect(notifier.send).toHaveBeenCalledTimes(1);
  });

  test("an expired trial is persisted even though request-time access already expires it", async () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    const fixture = await subscriptionFixture("expired-trial", {
      status: SubscriptionStatus.TRIALING,
      trialStartedAt: new Date("2026-08-02T12:00:00.000Z"),
      trialEndsAt: now,
    });
    const notifier = notifierMock();

    const summary = await processSubscriptionCycle(now, notifier);

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: fixture.subscription.id },
    });
    expect(summary.expiredTrials).toBe(1);
    expect(subscription.status).toBe(SubscriptionStatus.EXPIRED);
    expect(subscription.endedAt?.toISOString()).toBe(now.toISOString());
    expect(subscription.expiredHandled).toBe(true);
  });

  test("returns immediately when another worker owns the advisory lock", async () => {
    const transaction = jest.fn().mockImplementation(async (callback) =>
      callback({
        $queryRaw: jest.fn().mockResolvedValue([{ acquired: false }]),
      }),
    );
    const database = { $transaction: transaction };
    const notifier = notifierMock();

    const summary = await processSubscriptionCycle(
      new Date("2026-08-02T12:00:00.000Z"),
      notifier,
      database as never,
    );

    expect(summary).toEqual(expect.objectContaining({ acquired: false }));
    expect(notifier.send).not.toHaveBeenCalled();
  });
});
