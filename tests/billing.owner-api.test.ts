import {
  BillingInterval,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { BillingService } from "../src/modules/billing/billing.service";

function setup() {
  const currentPeriodEnd = new Date("2026-09-07T09:30:00.000Z");
  const subscription = {
    id: "sub1",
    businessId: "bus1",
    status: SubscriptionStatus.ACTIVE,
    currentPeriodEnd,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  };
  const payment = {
    id: "pay1",
    status: SubscriptionPaymentStatus.SUCCEEDED,
    amountCents: 79_900,
    currency: "EGP",
    checkoutUrl: "https://private-provider-url.example",
    providerCheckoutId: "provider-checkout-secret",
    providerPaymentId: "provider-payment-secret",
    failureCode: null,
    failureReason: null,
    paidAt: new Date("2026-08-07T09:30:00.000Z"),
    failedAt: null,
    expiresAt: null,
    createdAt: new Date("2026-08-07T09:00:00.000Z"),
    updatedAt: new Date("2026-08-07T09:30:00.000Z"),
    plan: { id: "plan1", code: "CORE", name: "Systemly Core" },
    price: {
      id: "price1",
      amountCents: 79_900,
      currency: "EGP",
      interval: BillingInterval.MONTHLY,
    },
  };
  const db = {
    plan: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: "plan1",
          code: "CORE",
          name: "Systemly Core",
          description: "Core plan",
          prices: [payment.price],
          entitlements: [{ key: "ONLINE_BOOKING", limit: null }],
        },
      ]),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(subscription),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...subscription, ...data }),
      ),
    },
    subscriptionPayment: {
      findMany: jest.fn().mockResolvedValue([payment]),
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(payment),
    },
  };
  const service = new BillingService(db as never, { get: jest.fn() });
  return { service, db, subscription, payment, currentPeriodEnd };
}

describe("owner billing API service", () => {
  test("lists public plans with one current monthly price", async () => {
    const { service } = setup();

    await expect(service.listPlans()).resolves.toEqual([
      {
        id: "plan1",
        code: "CORE",
        name: "Systemly Core",
        description: "Core plan",
        price: {
          id: "price1",
          amountCents: 79_900,
          currency: "EGP",
          interval: BillingInterval.MONTHLY,
        },
        entitlements: [{ key: "ONLINE_BOOKING", limit: null }],
      },
    ]);
  });

  test("scopes payment history to the authenticated business", async () => {
    const { service, db } = setup();

    const result = await service.listPayments("bus1", 2, 10);

    expect(db.subscriptionPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { subscription: { businessId: "bus1" } },
        skip: 10,
        take: 10,
      }),
    );
    expect(result.items[0]).not.toHaveProperty("providerCheckoutId");
    expect(result.items[0]).not.toHaveProperty("providerPaymentId");
    expect(result.items[0].checkoutUrl).toBeNull();
  });

  test("only exposes a checkout URL while payment requires action", async () => {
    const { service, db, payment } = setup();
    db.subscriptionPayment.findFirst.mockResolvedValue({
      ...payment,
      status: SubscriptionPaymentStatus.REQUIRES_ACTION,
    });

    const result = await service.getPayment("bus1", "pay1");

    expect(db.subscriptionPayment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "pay1",
          subscription: { businessId: "bus1" },
        },
      }),
    );
    expect(result.checkoutUrl).toBe(payment.checkoutUrl);
    expect(result).not.toHaveProperty("providerCheckoutId");
  });

  test("schedules cancellation without ending paid access", async () => {
    const { service, db } = setup();
    const now = new Date("2026-08-20T10:00:00.000Z");

    const result = await service.cancelAtPeriodEnd("bus1", now);

    expect(db.subscription.update).toHaveBeenCalledWith({
      where: { id: "sub1" },
      data: { cancelAtPeriodEnd: true, canceledAt: now },
    });
    expect(result.status).toBe(SubscriptionStatus.ACTIVE);
  });

  test("resumes a scheduled cancellation before period end", async () => {
    const { service, db, subscription } = setup();
    db.subscription.findUnique.mockResolvedValue({
      ...subscription,
      cancelAtPeriodEnd: true,
      canceledAt: new Date("2026-08-20T10:00:00.000Z"),
    });

    await service.resumeSubscription(
      "bus1",
      new Date("2026-08-21T10:00:00.000Z"),
    );

    expect(db.subscription.update).toHaveBeenCalledWith({
      where: { id: "sub1" },
      data: { cancelAtPeriodEnd: false, canceledAt: null },
    });
  });

  test("cannot resume after the paid period has ended", async () => {
    const { service, db, subscription } = setup();
    db.subscription.findUnique.mockResolvedValue({
      ...subscription,
      cancelAtPeriodEnd: true,
    });

    await expect(
      service.resumeSubscription(
        "bus1",
        new Date("2026-09-08T00:00:00.000Z"),
      ),
    ).rejects.toMatchObject({ code: "SUBSCRIPTION_NOT_RESUMABLE" });
  });
});
