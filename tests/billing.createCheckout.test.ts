import {
  BillingProvider,
  SubscriptionPaymentStatus,
} from "@prisma/client";
import { BillingService } from "../src/modules/billing/billing.service";
import type { BillingProviderAdapter } from "../src/modules/billing/billing-provider.types";
import { EasyKashAdapter } from "../src/modules/billing/providers/easykash.adapter";

const plan = {
  id: "plan1",
  code: "CORE",
  name: "Systemly Core",
  isActive: true,
  isPublic: true,
  prices: [
    {
      id: "price1",
      amountCents: 79_900,
      currency: "EGP",
    },
  ],
};

const subscription = {
  id: "sub1",
  businessId: "bus1",
  planId: "plan1",
  priceId: null,
  status: "TRIALING",
  business: { id: "bus1", name: "Test Clinic" },
};

function configuredAdapter(): BillingProviderAdapter {
  return {
    provider: BillingProvider.EASYKASH,
    capabilities: {
      checkout: true,
      webhookVerification: false,
      paymentLookup: false,
      automaticRenewal: false,
      refunds: false,
    },
    createCheckout: jest.fn().mockResolvedValue({
      providerCheckoutId: "ek-checkout-1",
      checkoutUrl: "https://checkout.example/ek-checkout-1",
    }),
    verifyWebhook: jest.fn(),
  };
}

function setup(adapter: BillingProviderAdapter, overrides: Record<string, unknown> = {}) {
  const pendingPayment = {
    id: "payment1",
    subscriptionId: subscription.id,
    planId: plan.id,
    priceId: plan.prices[0].id,
    provider: BillingProvider.EASYKASH,
    status: SubscriptionPaymentStatus.PENDING,
    amountCents: 79_900,
    currency: "EGP",
    checkoutUrl: null,
    expiresAt: new Date("2026-08-02T12:30:00.000Z"),
  };
  const readyPayment = {
    ...pendingPayment,
    status: SubscriptionPaymentStatus.REQUIRES_ACTION,
    providerCheckoutId: "ek-checkout-1",
    checkoutUrl: "https://checkout.example/ek-checkout-1",
  };
  let persistedPayment = { ...pendingPayment };

  const db = {
    plan: {
      findFirst: jest.fn().mockResolvedValue(plan),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue(subscription),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    businessUser: {
      findFirst: jest.fn().mockResolvedValue({
        name: "Owner",
        email: "owner@example.com",
        phone: "0123",
      }),
    },
    branch: {
      count: jest.fn().mockResolvedValue(1),
    },
    subscriptionPayment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => {
        persistedPayment = { ...pendingPayment, ...data };
        return Promise.resolve(persistedPayment);
      }),
      update: jest.fn().mockImplementation(({ data }) => {
        persistedPayment = { ...persistedPayment, ...data };
        return Promise.resolve(persistedPayment);
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    ...overrides,
  };
  const providers = { get: jest.fn().mockReturnValue(adapter) };
  return {
    service: new BillingService(db as never, providers),
    db,
    adapter,
    pendingPayment,
    readyPayment,
  };
}

describe("billing.createCheckout", () => {
  const now = new Date("2026-08-02T12:00:00.000Z");

  it("does not mutate billing data when EasyKash is not configured", async () => {
    const { service, db } = setup(new EasyKashAdapter());

    await expect(service.createCheckout("bus1", "plan1", now)).rejects.toMatchObject({
      code: "BILLING_PROVIDER_NOT_CONFIGURED",
    });

    expect(db.plan.findFirst).not.toHaveBeenCalled();
    expect(db.subscriptionPayment.create).not.toHaveBeenCalled();
    expect(db.subscription.update).not.toHaveBeenCalled();
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("creates a pending payment and never changes subscription access", async () => {
    const adapter = configuredAdapter();
    const { service, db } = setup(adapter);

    const result = await service.createCheckout("bus1", "plan1", now);

    expect(result.reused).toBe(false);
    expect(result.checkoutUrl).toBe("https://checkout.example/ek-checkout-1");
    expect(result.payment.amountCents).toBe(79_900);
    expect(result.pricing).toMatchObject({
      activeBranchCount: 1,
      additionalBranchCount: 0,
      nextRenewalAmountCents: 79_900,
    });
    expect(db.subscriptionPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        subscriptionId: "sub1",
        planId: "plan1",
        priceId: "price1",
        amountCents: 79_900,
        currency: "EGP",
        status: SubscriptionPaymentStatus.PENDING,
      }),
    });
    expect(adapter.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        internalPaymentId: "payment1",
        amountCents: 79_900,
        currency: "EGP",
      }),
    );
    expect(db.subscription.update).not.toHaveBeenCalled();
    expect(db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("adds 350 EGP for every active branch after the first", async () => {
    const adapter = configuredAdapter();
    const { service, db } = setup(adapter);
    db.branch.count.mockResolvedValue(3);

    const result = await service.createCheckout("bus1", "plan1", now);

    expect(result.pricing).toEqual({
      basePriceCents: 79_900,
      includedBranchCount: 1,
      activeBranchCount: 3,
      additionalBranchCount: 2,
      additionalBranchUnitPriceCents: 35_000,
      additionalBranchTotalCents: 70_000,
      nextRenewalAmountCents: 149_900,
      currency: "EGP",
    });
    expect(db.subscriptionPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountCents: 149_900 }),
    });
    expect(adapter.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 149_900 }),
    );
  });

  it("reuses a live hosted checkout when the current branch price still matches", async () => {
    const adapter = configuredAdapter();
    const { service, db, readyPayment } = setup(adapter);
    db.subscriptionPayment.findFirst.mockResolvedValue(readyPayment);

    const result = await service.createCheckout("bus1", "plan1", now);

    expect(result.reused).toBe(true);
    expect(result.checkoutUrl).toBe(readyPayment.checkoutUrl);
    expect(db.subscriptionPayment.create).not.toHaveBeenCalled();
    expect(adapter.createCheckout).not.toHaveBeenCalled();
  });

  it("cancels a stale hosted checkout when the active branch count changes", async () => {
    const adapter = configuredAdapter();
    const { service, db, readyPayment } = setup(adapter);
    db.branch.count.mockResolvedValue(2);
    db.subscriptionPayment.findFirst.mockResolvedValueOnce(readyPayment);

    const result = await service.createCheckout("bus1", "plan1", now);

    expect(db.subscriptionPayment.updateMany).toHaveBeenCalledWith({
      where: {
        id: readyPayment.id,
        status: {
          in: [
            SubscriptionPaymentStatus.PENDING,
            SubscriptionPaymentStatus.REQUIRES_ACTION,
          ],
        },
      },
      data: expect.objectContaining({
        status: SubscriptionPaymentStatus.CANCELED,
        failureCode: "CHECKOUT_PRICE_CHANGED",
      }),
    });
    expect(result.reused).toBe(false);
    expect(result.payment.amountCents).toBe(114_900);
    expect(adapter.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 114_900 }),
    );
  });

  it("returns the same branch pricing breakdown used by checkout", async () => {
    const adapter = configuredAdapter();
    const { service, db } = setup(adapter);
    db.branch.count.mockResolvedValue(2);

    await expect(service.getBranchPricing("bus1", "plan1")).resolves.toEqual({
      basePriceCents: 79_900,
      includedBranchCount: 1,
      activeBranchCount: 2,
      additionalBranchCount: 1,
      additionalBranchUnitPriceCents: 35_000,
      additionalBranchTotalCents: 35_000,
      nextRenewalAmountCents: 114_900,
      currency: "EGP",
    });
  });

  it("rejects a plan without an active monthly price", async () => {
    const adapter = configuredAdapter();
    const { service, db } = setup(adapter);
    db.plan.findFirst.mockResolvedValue({ ...plan, prices: [] });

    await expect(service.createCheckout("bus1", "plan1", now)).rejects.toMatchObject({
      code: "PLAN_PRICE_NOT_CONFIGURED",
    });
    expect(db.subscriptionPayment.create).not.toHaveBeenCalled();
  });
});