import {
  BillingProvider,
  Prisma,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import {
  addCalendarMonth,
  addExactDays,
  GRACE_PERIOD_DAYS,
} from "../subscriptions/subscription.service";
import type { VerifiedProviderEvent } from "./billing-provider.types";

const SUCCESS_SOURCE_STATUSES: SubscriptionPaymentStatus[] = [
  SubscriptionPaymentStatus.PENDING,
  SubscriptionPaymentStatus.REQUIRES_ACTION,
  SubscriptionPaymentStatus.FAILED,
  SubscriptionPaymentStatus.EXPIRED,
];
const FAILURE_SOURCE_STATUSES: SubscriptionPaymentStatus[] = [
  SubscriptionPaymentStatus.PENDING,
  SubscriptionPaymentStatus.REQUIRES_ACTION,
];
const MAX_SERIALIZABLE_ATTEMPTS = 3;

function lifecycleError(message: string, statusCode: number, code: string) {
  const error = new Error(message) as Error & {
    statusCode?: number;
    code?: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function isPrismaCode(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

function jsonPayload(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

export interface PaymentLifecycleResult {
  duplicateEvent: boolean;
  alreadyApplied: boolean;
  paymentId?: string;
  paymentStatus?: SubscriptionPaymentStatus;
  subscriptionStatus?: SubscriptionStatus;
}

export class PaymentLifecycleService {
  constructor(private readonly db: typeof prisma = prisma) {}

  async process(
    provider: BillingProvider,
    event: VerifiedProviderEvent,
  ): Promise<PaymentLifecycleResult> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.db.$transaction(
          (tx) => this.processInTransaction(tx, provider, event),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isPrismaCode(error, "P2002")) {
          const duplicate = await this.db.billingWebhookEvent.findUnique({
            where: {
              provider_providerEventId: {
                provider,
                providerEventId: event.providerEventId,
              },
            },
          });
          if (duplicate) {
            return { duplicateEvent: true, alreadyApplied: true };
          }
        }

        if (isPrismaCode(error, "P2034") && attempt < MAX_SERIALIZABLE_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }

    throw lifecycleError(
      "The payment event could not be processed safely.",
      409,
      "PAYMENT_EVENT_CONFLICT",
    );
  }

  private async processInTransaction(
    tx: Prisma.TransactionClient,
    provider: BillingProvider,
    event: VerifiedProviderEvent,
  ): Promise<PaymentLifecycleResult> {
    const webhookEvent = await tx.billingWebhookEvent.create({
      data: {
        provider,
        providerEventId: event.providerEventId,
        eventType: event.type,
        payload: jsonPayload(event.payload),
      },
    });

    const payment = await tx.subscriptionPayment.findUnique({
      where: { id: event.internalPaymentId },
      include: { subscription: true },
    });
    if (!payment) {
      throw lifecycleError(
        "Subscription payment not found.",
        404,
        "SUBSCRIPTION_PAYMENT_NOT_FOUND",
      );
    }
    if (payment.provider !== provider) {
      throw lifecycleError(
        "The payment provider does not match this payment.",
        409,
        "PAYMENT_PROVIDER_MISMATCH",
      );
    }

    let result: PaymentLifecycleResult;
    switch (event.type) {
      case "PAYMENT_SUCCEEDED":
        result = await this.applySuccessfulPayment(tx, payment, event);
        break;
      case "PAYMENT_FAILED":
        result = await this.applyFailedPayment(tx, payment, event);
        break;
      case "PAYMENT_REFUNDED":
        result = await this.applyRefund(tx, payment, event);
        break;
    }

    await tx.billingWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processedAt: new Date() },
    });
    return result;
  }

  private async applySuccessfulPayment(
    tx: Prisma.TransactionClient,
    payment: Prisma.SubscriptionPaymentGetPayload<{
      include: { subscription: true };
    }>,
    event: Extract<VerifiedProviderEvent, { type: "PAYMENT_SUCCEEDED" }>,
  ): Promise<PaymentLifecycleResult> {
    if (
      event.amountCents !== payment.amountCents ||
      event.currency.toUpperCase() !== payment.currency.toUpperCase()
    ) {
      throw lifecycleError(
        "The provider payment amount does not match the checkout.",
        409,
        "PAYMENT_AMOUNT_MISMATCH",
      );
    }

    const claimed = await tx.subscriptionPayment.updateMany({
      where: {
        id: payment.id,
        status: { in: SUCCESS_SOURCE_STATUSES },
      },
      data: {
        status: SubscriptionPaymentStatus.SUCCEEDED,
        providerPaymentId: event.providerPaymentId,
        paidAt: event.occurredAt,
        failedAt: null,
        failureCode: null,
        failureReason: null,
      },
    });

    if (claimed.count === 0) {
      return {
        duplicateEvent: false,
        alreadyApplied: true,
        paymentId: payment.id,
        paymentStatus: payment.status,
        subscriptionStatus: payment.subscription.status,
      };
    }

    const shouldExtendCurrentPeriod =
      payment.subscription.status === SubscriptionStatus.ACTIVE &&
      payment.subscription.currentPeriodEnd !== null &&
      payment.subscription.currentPeriodEnd > event.occurredAt;
    const periodStart = shouldExtendCurrentPeriod
      ? payment.subscription.currentPeriodEnd!
      : event.occurredAt;
    const periodEnd = addCalendarMonth(periodStart);

    await tx.subscription.update({
      where: { id: payment.subscriptionId },
      data: {
        planId: payment.planId,
        priceId: payment.priceId,
        status: SubscriptionStatus.ACTIVE,
        provider: payment.provider,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        graceEndsAt: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
        expiredHandled: false,
      },
    });

    return {
      duplicateEvent: false,
      alreadyApplied: false,
      paymentId: payment.id,
      paymentStatus: SubscriptionPaymentStatus.SUCCEEDED,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    };
  }

  private async applyFailedPayment(
    tx: Prisma.TransactionClient,
    payment: Prisma.SubscriptionPaymentGetPayload<{
      include: { subscription: true };
    }>,
    event: Extract<VerifiedProviderEvent, { type: "PAYMENT_FAILED" }>,
  ): Promise<PaymentLifecycleResult> {
    const claimed = await tx.subscriptionPayment.updateMany({
      where: {
        id: payment.id,
        status: { in: FAILURE_SOURCE_STATUSES },
      },
      data: {
        status: SubscriptionPaymentStatus.FAILED,
        providerPaymentId: event.providerPaymentId ?? payment.providerPaymentId,
        failedAt: event.occurredAt,
        failureCode: event.failureCode ?? null,
        failureReason: event.failureReason ?? "Payment failed.",
      },
    });

    if (claimed.count === 0) {
      return {
        duplicateEvent: false,
        alreadyApplied: true,
        paymentId: payment.id,
        paymentStatus: payment.status,
        subscriptionStatus: payment.subscription.status,
      };
    }

    let subscriptionStatus = payment.subscription.status;
    const paidPeriodEnded =
      payment.subscription.currentPeriodEnd !== null &&
      payment.subscription.currentPeriodEnd <= event.occurredAt;
    const graceStillActive =
      payment.subscription.status === SubscriptionStatus.PAST_DUE &&
      payment.subscription.graceEndsAt !== null &&
      payment.subscription.graceEndsAt > event.occurredAt;

    if (paidPeriodEnded && !graceStillActive) {
      subscriptionStatus = SubscriptionStatus.PAST_DUE;
      await tx.subscription.update({
        where: { id: payment.subscriptionId },
        data: {
          status: SubscriptionStatus.PAST_DUE,
          graceEndsAt: addExactDays(event.occurredAt, GRACE_PERIOD_DAYS),
          endedAt: null,
          expiredHandled: false,
        },
      });
    }

    return {
      duplicateEvent: false,
      alreadyApplied: false,
      paymentId: payment.id,
      paymentStatus: SubscriptionPaymentStatus.FAILED,
      subscriptionStatus,
    };
  }

  private async applyRefund(
    tx: Prisma.TransactionClient,
    payment: Prisma.SubscriptionPaymentGetPayload<{
      include: { subscription: true };
    }>,
    event: Extract<VerifiedProviderEvent, { type: "PAYMENT_REFUNDED" }>,
  ): Promise<PaymentLifecycleResult> {
    const updated = await tx.subscriptionPayment.updateMany({
      where: {
        id: payment.id,
        status: SubscriptionPaymentStatus.SUCCEEDED,
      },
      data: {
        status: SubscriptionPaymentStatus.REFUNDED,
        providerPaymentId: event.providerPaymentId,
      },
    });

    return {
      duplicateEvent: false,
      alreadyApplied: updated.count === 0,
      paymentId: payment.id,
      paymentStatus:
        updated.count === 0
          ? payment.status
          : SubscriptionPaymentStatus.REFUNDED,
      subscriptionStatus: payment.subscription.status,
    };
  }
}

export default new PaymentLifecycleService();
