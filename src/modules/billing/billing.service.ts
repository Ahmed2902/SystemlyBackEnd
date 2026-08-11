import {
  BillingInterval,
  BillingProvider,
  Prisma,
  Roles,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { PLAN_CODES } from "../subscriptions/subscription.catalog";
import { getBusinessSubscription } from "../subscriptions/subscription.service";
import {
  billingProviderRegistry,
  type BillingProviderResolver,
} from "./billing-provider.registry";
import { billingProviderNotConfigured } from "./providers/easykash.adapter";

const CHECKOUT_TTL_MS = 30 * 60 * 1000;
const INCLUDED_BRANCH_COUNT = 1;
const ADDITIONAL_BRANCH_PRICE_CENTS = 35_000;
const OPEN_PAYMENT_STATUSES: SubscriptionPaymentStatus[] = [
  SubscriptionPaymentStatus.PENDING,
  SubscriptionPaymentStatus.REQUIRES_ACTION,
];
const CANCELLABLE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
];

export type BranchPricing = {
  basePriceCents: number;
  includedBranchCount: number;
  activeBranchCount: number;
  additionalBranchCount: number;
  additionalBranchUnitPriceCents: number;
  additionalBranchTotalCents: number;
  nextRenewalAmountCents: number;
  currency: string;
};

function billingError(message: string, statusCode: number, code: string) {
  const error = new Error(message) as Error & {
    statusCode?: number;
    code?: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function paymentView(payment: {
  id: string;
  status: SubscriptionPaymentStatus;
  amountCents: number;
  currency: string;
  checkoutUrl: string | null;
  failureCode: string | null;
  failureReason: string | null;
  paidAt: Date | null;
  failedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  plan: { id: string; code: string; name: string };
  price: {
    id: string;
    amountCents: number;
    currency: string;
    interval: BillingInterval;
  };
}) {
  return {
    id: payment.id,
    status: payment.status,
    amountCents: payment.amountCents,
    currency: payment.currency,
    checkoutUrl:
      payment.status === SubscriptionPaymentStatus.REQUIRES_ACTION
        ? payment.checkoutUrl
        : null,
    failureCode: payment.failureCode,
    failureReason: payment.failureReason,
    paidAt: payment.paidAt,
    failedAt: payment.failedAt,
    expiresAt: payment.expiresAt,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    plan: payment.plan,
    price: payment.price,
  };
}

const paymentInclude = {
  plan: { select: { id: true, code: true, name: true } },
  price: {
    select: {
      id: true,
      amountCents: true,
      currency: true,
      interval: true,
    },
  },
} satisfies Prisma.SubscriptionPaymentInclude;

function calculateBranchPricing(
  basePriceCents: number,
  currency: string,
  activeBranchCount: number,
): BranchPricing {
  const additionalBranchCount = Math.max(
    0,
    activeBranchCount - INCLUDED_BRANCH_COUNT,
  );
  const additionalBranchTotalCents =
    additionalBranchCount * ADDITIONAL_BRANCH_PRICE_CENTS;

  return {
    basePriceCents,
    includedBranchCount: INCLUDED_BRANCH_COUNT,
    activeBranchCount,
    additionalBranchCount,
    additionalBranchUnitPriceCents: ADDITIONAL_BRANCH_PRICE_CENTS,
    additionalBranchTotalCents,
    nextRenewalAmountCents: basePriceCents + additionalBranchTotalCents,
    currency,
  };
}

export class BillingService {
  constructor(
    private readonly db: typeof prisma = prisma,
    private readonly providers: BillingProviderResolver = billingProviderRegistry,
  ) {}

  findSubscription(businessId: string) {
    return getBusinessSubscription(businessId);
  }

  async listPlans() {
    const plans = await this.db.plan.findMany({
      where: { isActive: true, isPublic: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        prices: {
          where: { isActive: true, interval: BillingInterval.MONTHLY },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            amountCents: true,
            currency: true,
            interval: true,
          },
        },
        entitlements: {
          where: { enabled: true },
          orderBy: { key: "asc" },
          select: { key: true, limit: true },
        },
      },
    });

    return plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      price: plan.prices[0] ?? null,
      entitlements: plan.entitlements,
    }));
  }

  async getBranchPricing(businessId: string, planId?: string) {
    const [{ price }, activeBranchCount] = await Promise.all([
      this.checkoutPlan(planId),
      this.db.branch.count({ where: { businessId, isActive: true } }),
    ]);

    return calculateBranchPricing(
      price.amountCents,
      price.currency,
      activeBranchCount,
    );
  }

  async listPayments(businessId: string, page = 1, perPage = 20) {
    const where: Prisma.SubscriptionPaymentWhereInput = {
      subscription: { businessId },
    };
    const [items, total] = await Promise.all([
      this.db.subscriptionPayment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        include: paymentInclude,
      }),
      this.db.subscriptionPayment.count({ where }),
    ]);
    return {
      items: items.map(paymentView),
      total,
      page,
      perPage,
    };
  }

  async getPayment(businessId: string, paymentId: string) {
    const payment = await this.db.subscriptionPayment.findFirst({
      where: {
        id: paymentId,
        subscription: { businessId },
      },
      include: paymentInclude,
    });
    if (!payment) {
      throw billingError(
        "Subscription payment not found.",
        404,
        "SUBSCRIPTION_PAYMENT_NOT_FOUND",
      );
    }
    return paymentView(payment);
  }

  async extendPilotTrial(businessId: string, days: number, now = new Date()) {
    const subscription = await this.db.subscription.findUnique({
      where: { businessId },
    });
    if (!subscription) {
      throw billingError(
        "Subscription not found for this business.",
        404,
        "SUBSCRIPTION_NOT_FOUND",
      );
    }
    if (subscription.status === SubscriptionStatus.ACTIVE) {
      throw billingError(
        "Active paid subscriptions cannot be converted back to a pilot trial.",
        409,
        "PAID_SUBSCRIPTION_ACTIVE",
      );
    }

    const currentEnd = subscription.trialEndsAt;
    const base = currentEnd && currentEnd > now ? currentEnd : now;
    const trialEndsAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    return this.db.subscription.update({
      where: { id: subscription.id },
      data: {
        status: SubscriptionStatus.TRIALING,
        trialStartedAt: subscription.trialStartedAt ?? now,
        trialEndsAt,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        graceEndsAt: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
        expiredHandled: false,
        trialNotified3Days: false,
        trialNotified1Day: false,
      },
    });
  }

  async cancelAtPeriodEnd(businessId: string, now = new Date()) {
    const subscription = await this.db.subscription.findUnique({
      where: { businessId },
    });
    if (!subscription) {
      throw billingError(
        "Subscription not found for this business.",
        404,
        "SUBSCRIPTION_NOT_FOUND",
      );
    }
    if (
      !CANCELLABLE_STATUSES.includes(subscription.status) ||
      !subscription.currentPeriodEnd ||
      subscription.currentPeriodEnd <= now
    ) {
      throw billingError(
        "Only a current paid subscription can be canceled at period end.",
        409,
        "SUBSCRIPTION_NOT_CANCELLABLE",
      );
    }
    if (subscription.cancelAtPeriodEnd) return subscription;

    return this.db.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
        canceledAt: now,
      },
    });
  }

  async resumeSubscription(businessId: string, now = new Date()) {
    const subscription = await this.db.subscription.findUnique({
      where: { businessId },
    });
    if (!subscription) {
      throw billingError(
        "Subscription not found for this business.",
        404,
        "SUBSCRIPTION_NOT_FOUND",
      );
    }
    if (
      !subscription.cancelAtPeriodEnd ||
      !CANCELLABLE_STATUSES.includes(subscription.status) ||
      !subscription.currentPeriodEnd ||
      subscription.currentPeriodEnd <= now
    ) {
      throw billingError(
        "This subscription cannot be resumed.",
        409,
        "SUBSCRIPTION_NOT_RESUMABLE",
      );
    }

    return this.db.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    });
  }

  private async checkoutPlan(planId?: string) {
    const plan = await this.db.plan.findFirst({
      where: planId
        ? { id: planId, isActive: true, isPublic: true }
        : { code: PLAN_CODES.CORE, isActive: true, isPublic: true },
      include: {
        prices: {
          where: { isActive: true, interval: BillingInterval.MONTHLY },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!plan) {
      throw billingError("Subscription plan not found.", 404, "PLAN_NOT_FOUND");
    }

    const price = plan.prices[0] ?? null;
    if (!price) {
      throw billingError(
        "This subscription plan is not currently available for purchase.",
        409,
        "PLAN_PRICE_NOT_CONFIGURED",
      );
    }

    return { plan, price };
  }

  private findOpenPayment(subscriptionId: string, planId: string, now: Date) {
    return this.db.subscriptionPayment.findFirst({
      where: {
        subscriptionId,
        planId,
        status: { in: OPEN_PAYMENT_STATUSES },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async createPendingPayment(input: {
    subscriptionId: string;
    planId: string;
    priceId: string;
    amountCents: number;
    currency: string;
    expiresAt: Date;
    now: Date;
  }) {
    try {
      return await this.db.subscriptionPayment.create({
        data: {
          subscriptionId: input.subscriptionId,
          planId: input.planId,
          priceId: input.priceId,
          provider: BillingProvider.EASYKASH,
          status: SubscriptionPaymentStatus.PENDING,
          amountCents: input.amountCents,
          currency: input.currency,
          expiresAt: input.expiresAt,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await this.findOpenPayment(
        input.subscriptionId,
        input.planId,
        input.now,
      );
      if (!existing) throw error;
      return existing;
    }
  }

  async createCheckout(businessId: string, planId?: string, now = new Date()) {
    const adapter = this.providers.get(BillingProvider.EASYKASH);
    if (!adapter.capabilities.checkout) {
      throw billingProviderNotConfigured();
    }

    const [{ plan, price }, subscription, owner, activeBranchCount] =
      await Promise.all([
        this.checkoutPlan(planId),
        this.db.subscription.findUnique({
          where: { businessId },
          include: { business: true },
        }),
        this.db.businessUser.findFirst({
          where: { businessId, role: Roles.BusinessAdmin },
          orderBy: { createdAt: "asc" },
          select: { name: true, email: true, phone: true },
        }),
        this.db.branch.count({ where: { businessId, isActive: true } }),
      ]);

    if (!subscription?.business) {
      throw billingError(
        "Subscription not found for this business.",
        404,
        "SUBSCRIPTION_NOT_FOUND",
      );
    }
    if (!owner?.email) {
      throw billingError(
        "The business owner needs an email address before checkout.",
        409,
        "BILLING_CUSTOMER_INCOMPLETE",
      );
    }

    const pricing = calculateBranchPricing(
      price.amountCents,
      price.currency,
      activeBranchCount,
    );

    let payment = await this.findOpenPayment(subscription.id, plan.id, now);
    if (
      payment &&
      (payment.amountCents !== pricing.nextRenewalAmountCents ||
        payment.currency.toUpperCase() !== pricing.currency.toUpperCase())
    ) {
      await this.db.subscriptionPayment.updateMany({
        where: { id: payment.id, status: { in: OPEN_PAYMENT_STATUSES } },
        data: {
          status: SubscriptionPaymentStatus.CANCELED,
          failureCode: "CHECKOUT_PRICE_CHANGED",
          failureReason: "Branch count changed before checkout completion.",
          failedAt: now,
        },
      });
      payment = null;
    }

    if (payment?.checkoutUrl) {
      return {
        payment,
        checkoutUrl: payment.checkoutUrl,
        reused: true,
        pricing,
      };
    }

    const expiresAt = new Date(now.getTime() + CHECKOUT_TTL_MS);
    payment ??= await this.createPendingPayment({
      subscriptionId: subscription.id,
      planId: plan.id,
      priceId: price.id,
      amountCents: pricing.nextRenewalAmountCents,
      currency: pricing.currency,
      expiresAt,
      now,
    });

    try {
      const checkout = await adapter.createCheckout({
        internalPaymentId: payment.id,
        amountCents: payment.amountCents,
        currency: payment.currency,
        description: `${plan.name} monthly subscription`,
        customer: {
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
        },
        returnUrl: `${process.env.FRONTEND_URL ?? "http://localhost:3000"}/operations/settings/billing/return?paymentId=${encodeURIComponent(payment.id)}`,
      });

      const updatedPayment = await this.db.subscriptionPayment.update({
        where: { id: payment.id },
        data: {
          status: SubscriptionPaymentStatus.REQUIRES_ACTION,
          providerCheckoutId: checkout.providerCheckoutId,
          checkoutUrl: checkout.checkoutUrl,
          expiresAt: checkout.expiresAt ?? expiresAt,
          failureCode: null,
          failureReason: null,
          failedAt: null,
        },
      });

      return {
        payment: updatedPayment,
        checkoutUrl: checkout.checkoutUrl,
        reused: false,
        pricing,
      };
    } catch (error) {
      await this.db.subscriptionPayment.updateMany({
        where: {
          id: payment.id,
          status: SubscriptionPaymentStatus.PENDING,
        },
        data: {
          status: SubscriptionPaymentStatus.FAILED,
          failureCode:
            error instanceof Error && "code" in error
              ? String((error as Error & { code?: string }).code ?? "") || null
              : null,
          failureReason:
            error instanceof Error
              ? error.message
              : "Checkout creation failed.",
          failedAt: now,
        },
      });
      throw error;
    }
  }
}

const billingService = new BillingService();
export default billingService;

export const findSubscription =
  billingService.findSubscription.bind(billingService);
export const createCheckout =
  billingService.createCheckout.bind(billingService);