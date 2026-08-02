import {
  BillingProvider,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { PaymentLifecycleService } from "../src/modules/billing/payment-lifecycle.service";
import { ensureCorePlan } from "../src/modules/subscriptions/subscription.seed";
import { startLifetimeTrial } from "../src/modules/subscriptions/subscription.service";
import { prisma } from "../src/shared/db/prisma";

const businessIds: string[] = [];
const providerEventIds: string[] = [];
const lifecycle = new PaymentLifecycleService();

async function trialFixture(suffix: string) {
  const { plan, price } = await ensureCorePlan();
  const business = await prisma.business.create({
    data: {
      name: `Payment Lifecycle ${suffix}`,
      slug: `payment-lifecycle-${suffix}-${Date.now()}-${Math.random()}`,
      vertical: "salon",
      phone: "+201000000000",
      isActive: true,
    },
  });
  businessIds.push(business.id);
  const trialStartedAt = new Date("2026-08-02T12:00:00.000Z");
  const subscription = await prisma.$transaction((tx) =>
    startLifetimeTrial(tx, business.id, trialStartedAt),
  );
  const payment = await prisma.subscriptionPayment.create({
    data: {
      subscriptionId: subscription.id,
      planId: plan.id,
      priceId: price.id,
      provider: BillingProvider.EASYKASH,
      status: SubscriptionPaymentStatus.REQUIRES_ACTION,
      amountCents: price.amountCents,
      currency: price.currency,
      providerCheckoutId: `checkout-${suffix}`,
      checkoutUrl: `https://checkout.example/${suffix}`,
    },
  });
  return { business, subscription, payment, plan, price };
}

function successEvent(input: {
  eventId: string;
  paymentId: string;
  paidAt: Date;
  amountCents?: number;
  currency?: string;
}) {
  providerEventIds.push(input.eventId);
  return {
    type: "PAYMENT_SUCCEEDED" as const,
    providerEventId: input.eventId,
    providerPaymentId: `provider-${input.eventId}`,
    internalPaymentId: input.paymentId,
    amountCents: input.amountCents ?? 79_900,
    currency: input.currency ?? "EGP",
    occurredAt: input.paidAt,
    payload: { eventId: input.eventId },
  };
}

function failedEvent(input: {
  eventId: string;
  paymentId: string;
  failedAt: Date;
}) {
  providerEventIds.push(input.eventId);
  return {
    type: "PAYMENT_FAILED" as const,
    providerEventId: input.eventId,
    providerPaymentId: `provider-${input.eventId}`,
    internalPaymentId: input.paymentId,
    failureCode: "DECLINED",
    failureReason: "Card declined",
    occurredAt: input.failedAt,
    payload: { eventId: input.eventId },
  };
}

afterEach(async () => {
  if (providerEventIds.length > 0) {
    await prisma.billingWebhookEvent.deleteMany({
      where: { providerEventId: { in: providerEventIds.splice(0) } },
    });
  }
  if (businessIds.length > 0) {
    await prisma.business.deleteMany({
      where: { id: { in: businessIds.splice(0) } },
    });
  }
});

describe("payment lifecycle", () => {
  test("a verified payment converts a trial immediately", async () => {
    const fixture = await trialFixture("trial-success");
    const paidAt = new Date("2026-08-07T09:30:00.000Z");

    const result = await lifecycle.process(
      BillingProvider.EASYKASH,
      successEvent({
        eventId: "trial-success-event",
        paymentId: fixture.payment.id,
        paidAt,
      }),
    );

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: fixture.subscription.id },
    });
    expect(result.alreadyApplied).toBe(false);
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
    expect(subscription.priceId).toBe(fixture.price.id);
    expect(subscription.currentPeriodStart?.toISOString()).toBe(
      paidAt.toISOString(),
    );
    expect(subscription.currentPeriodEnd?.toISOString()).toBe(
      "2026-09-07T09:30:00.000Z",
    );
  });

  test("an early renewal extends from the current paid period end", async () => {
    const fixture = await trialFixture("early-renewal");
    await prisma.subscription.update({
      where: { id: fixture.subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        priceId: fixture.price.id,
        currentPeriodStart: new Date("2026-08-07T09:30:00.000Z"),
        currentPeriodEnd: new Date("2026-09-07T09:30:00.000Z"),
      },
    });
    const paidAt = new Date("2026-09-05T08:00:00.000Z");

    await lifecycle.process(
      BillingProvider.EASYKASH,
      successEvent({
        eventId: "early-renewal-event",
        paymentId: fixture.payment.id,
        paidAt,
      }),
    );

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: fixture.subscription.id },
    });
    expect(subscription.currentPeriodStart?.toISOString()).toBe(
      "2026-09-07T09:30:00.000Z",
    );
    expect(subscription.currentPeriodEnd?.toISOString()).toBe(
      "2026-10-07T09:30:00.000Z",
    );
  });

  test("a failed payment does not destroy a valid trial", async () => {
    const fixture = await trialFixture("trial-failure");

    await lifecycle.process(
      BillingProvider.EASYKASH,
      failedEvent({
        eventId: "trial-failure-event",
        paymentId: fixture.payment.id,
        failedAt: new Date("2026-08-05T08:00:00.000Z"),
      }),
    );

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: fixture.subscription.id },
    });
    expect(subscription.status).toBe(SubscriptionStatus.TRIALING);
    expect(subscription.graceEndsAt).toBeNull();
  });

  test("a failed renewal after period end starts a three-day grace period", async () => {
    const fixture = await trialFixture("renewal-failure");
    await prisma.subscription.update({
      where: { id: fixture.subscription.id },
      data: {
        status: SubscriptionStatus.ACTIVE,
        priceId: fixture.price.id,
        currentPeriodStart: new Date("2026-08-07T09:30:00.000Z"),
        currentPeriodEnd: new Date("2026-09-07T09:30:00.000Z"),
      },
    });
    const failedAt = new Date("2026-09-07T10:00:00.000Z");

    await lifecycle.process(
      BillingProvider.EASYKASH,
      failedEvent({
        eventId: "renewal-failure-event",
        paymentId: fixture.payment.id,
        failedAt,
      }),
    );

    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: fixture.subscription.id },
    });
    expect(subscription.status).toBe(SubscriptionStatus.PAST_DUE);
    expect(subscription.graceEndsAt?.toISOString()).toBe(
      "2026-09-10T10:00:00.000Z",
    );
  });

  test("the same provider event cannot extend the period twice", async () => {
    const fixture = await trialFixture("duplicate-event");
    const event = successEvent({
      eventId: "duplicate-success-event",
      paymentId: fixture.payment.id,
      paidAt: new Date("2026-08-07T09:30:00.000Z"),
    });

    const first = await lifecycle.process(BillingProvider.EASYKASH, event);
    const second = await lifecycle.process(BillingProvider.EASYKASH, event);
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { id: fixture.subscription.id },
    });

    expect(first.alreadyApplied).toBe(false);
    expect(second.duplicateEvent).toBe(true);
    expect(subscription.currentPeriodEnd?.toISOString()).toBe(
      "2026-09-07T09:30:00.000Z",
    );
  });

  test("amount mismatches roll back without changing payment or subscription", async () => {
    const fixture = await trialFixture("amount-mismatch");
    const eventId = "amount-mismatch-event";

    await expect(
      lifecycle.process(
        BillingProvider.EASYKASH,
        successEvent({
          eventId,
          paymentId: fixture.payment.id,
          paidAt: new Date("2026-08-07T09:30:00.000Z"),
          amountCents: 1,
        }),
      ),
    ).rejects.toMatchObject({ code: "PAYMENT_AMOUNT_MISMATCH" });

    const [payment, subscription, eventCount] = await Promise.all([
      prisma.subscriptionPayment.findUniqueOrThrow({
        where: { id: fixture.payment.id },
      }),
      prisma.subscription.findUniqueOrThrow({
        where: { id: fixture.subscription.id },
      }),
      prisma.billingWebhookEvent.count({ where: { providerEventId: eventId } }),
    ]);
    expect(payment.status).toBe(SubscriptionPaymentStatus.REQUIRES_ACTION);
    expect(subscription.status).toBe(SubscriptionStatus.TRIALING);
    expect(eventCount).toBe(0);
  });
});
