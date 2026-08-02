import {
  BillingInterval,
  BillingProvider,
  Prisma,
  Roles,
  SubscriptionPaymentStatus,
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
const OPEN_PAYMENT_STATUSES: SubscriptionPaymentStatus[] = [
  SubscriptionPaymentStatus.PENDING,
  SubscriptionPaymentStatus.REQUIRES_ACTION,
];

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

export class BillingService {
  constructor(
    private readonly db: typeof prisma = prisma,
    private readonly providers: BillingProviderResolver = billingProviderRegistry,
  ) {}

  findSubscription(businessId: string) {
    return getBusinessSubscription(businessId);
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
      throw billingError(
        "Subscription plan not found.",
        404,
        "PLAN_NOT_FOUND",
      );
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

  private findOpenPayment(
    subscriptionId: string,
    planId: string,
    now: Date,
  ) {
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

  async createCheckout(
    businessId: string,
    planId?: string,
    now = new Date(),
  ) {
    const adapter = this.providers.get(BillingProvider.EASYKASH);
    if (!adapter.capabilities.checkout) {
      throw billingProviderNotConfigured();
    }

    const [{ plan, price }, subscription, owner] = await Promise.all([
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

    let payment = await this.findOpenPayment(subscription.id, plan.id, now);
    if (payment?.checkoutUrl) {
      return {
        payment,
        checkoutUrl: payment.checkoutUrl,
        reused: true,
      };
    }

    const expiresAt = new Date(now.getTime() + CHECKOUT_TTL_MS);
    payment ??= await this.createPendingPayment({
      subscriptionId: subscription.id,
      planId: plan.id,
      priceId: price.id,
      amountCents: price.amountCents,
      currency: price.currency,
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
            error instanceof Error ? error.message : "Checkout creation failed.",
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
