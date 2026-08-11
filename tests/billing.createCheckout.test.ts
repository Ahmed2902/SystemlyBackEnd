import {
  BillingProvider,
  SubscriptionPaymentStatus,
} from "@prisma/client";
import { BillingService } from "../src/modules/billing/billing.service";
import type { BillingProviderAdapter } from "../src/modules/billing/billing-provider.types";
import { EasyKashAdapter } from "../src/modules/billing/providers/easykash.adapter";
import { calculateBranchPricing } from "../src/modules/subscriptions/branch-pricing.service";

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

function setup(
  adapter: BillingProviderAdapter,
  options: { activeBranchCount?: number } = {},
) {
  const activeBranchCount = options.activeBranchCount ?? 1;
  const amountCents = 79_900 + Math.max(activeBranchCount - 1, 0) * 30_000;
  const pendingPayment = {
    id: "payment1",
    subscriptionId: subscription.id,
    planId: plan.id,
    priceId: plan.prices[0].id,
    provider: BillingProvider.EASYKASH,
    status: SubscriptionPaymentStatus.PENDING,
    amountCents,
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

  const db = {
    plan: {
      findFirst: jest.fn().mockResolvedValue(plan),
    },
    branch: {
      count: jest.fn().mockResolvedValue(activeBranchCount),
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
    subscriptionPayment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(pendingPayment),
      update: jest.fn().mockResolvedValue(readyPayment),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
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

describe("branch subscription pricing", () => {
  it("includes the first active branch in Core", () => {
    expect(calculateBranchPricing(79_900, 1)).toEqual({
      basePriceCents: 79_900,
      includedBranchCount: 1,
      activeBranchCount: 1,
      additionalBranchCount: 0,
      additionalBranchUnitPriceCents: 30_000,
      additionalBranchTotalCents: 0,
      nextRenewalAmountCents: 79_900,
      currency: "EGP",
    });
  });

  it("adds 300 EGP for each active branch after the first", () => {
    const pricing = calculateBranchPricing(79_900, 3);
    expect(pricing.additionalBranchCount).toBe(2);
    expect(pricing.additionalBranchTotalCents).toBe(60_000);
    expect(pricing.nextRenewalAmountCents).toBe(139_900);
  });
});

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

  it("creates a 799 EGP payment when only the included branch is active", async () => {
    const adapter = configuredAdapter();
    const { service, db, readyPayment } = setup(adapter);

    const result = await service.createCheckout("bus1", "plan1", now);

    expect(result.payment).toEqual(readyPayment);
    expect(result.checkoutUrl).toBe("https://checkout.example/ek-checkout-1");
    expect(result.reused).toBe(false);
    expect(result.pricing.nextRenewalAmountCents).toBe(79_900);
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

  it("adds 300 EGP for a second active branch", async () => {
    const adapter = configuredAdapter();
    const { service, db } = setup(adapter, { activeBranchCount: 2 });

    const result = await service.createCheckout("bus1", "plan1", now);

    expect(result.pricing.additionalBranchCount).toBe(1);
    expect(result.pricing.nextRenewalAmountCents).toBe(109_900);
    expect(db.subscriptionPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountCents: 109_900 }),
    });
    expect(adapter.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 109_900 }),
    );
  });

  it("reuses a live hosted checkout when its price still matches", async () => {
    const adapter = configuredAdapter();
    const { service, db, readyPayment } = setup(adapter);
    db.subscriptionPayment.findFirst.mockResolvedValue(readyPayment);

    const result = await service.createCheckout("bus1", "plan1", now);

    expect(result.reused).toBe(true);
    expect(result.checkoutUrl).toBe(readyPayment.checkoutUrl);
    expect(db.subscriptionPayment.create).not.toHaveBeenCalled();
    expect(adapter.createCheckout).not.toHaveBeenCalled();
  });

  it("cancels a stale cheaper checkout after the active branch count changes", async () => {
    const adapter = configuredAdapter();
    const { service, db } = setup(adapter, { activeBranchCount: 2 });
    db.subscriptionPayment.findFirst.mockResolvedValue({
      id: "old-payment",
      amountCents: 79_900,
      checkoutUrl: "https://checkout.example/old",
      status: SubscriptionPaymentStatus.REQUIRES_ACTION,
    });

    await service.createCheckout("bus1", "plan1", now);

    expect(db.subscriptionPayment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "old-payment",
        status: { in: [
          SubscriptionPaymentStatus.PENDING,
          SubscriptionPaymentStatus.REQUIRES_ACTION,
        ] },
      },
      data: expect.objectContaining({
        status: SubscriptionPaymentStatus.CANCELED,
        failureCode: "PRICING_CHANGED",
        checkoutUrl: null,
      }),
    });
    expect(db.subscriptionPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amountCents: 109_900 }),
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
