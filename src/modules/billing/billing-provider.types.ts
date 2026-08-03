import { BillingProvider } from "@prisma/client";

export interface BillingProviderCapabilities {
  checkout: boolean;
  webhookVerification: boolean;
  paymentLookup: boolean;
  automaticRenewal: boolean;
  refunds: boolean;
}

export interface CreateProviderCheckoutInput {
  internalPaymentId: string;
  amountCents: number;
  currency: string;
  description: string;
  customer: {
    name: string;
    email: string;
    phone?: string | null;
  };
  returnUrl: string;
}

export interface ProviderCheckout {
  providerCheckoutId: string;
  checkoutUrl: string;
  expiresAt?: Date | null;
}

export interface VerifyProviderWebhookInput {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export type VerifiedProviderEvent =
  | {
      type: "PAYMENT_SUCCEEDED";
      providerEventId: string;
      providerPaymentId: string;
      internalPaymentId: string;
      amountCents: number;
      currency: string;
      occurredAt: Date;
      payload: unknown;
    }
  | {
      type: "PAYMENT_FAILED";
      providerEventId: string;
      providerPaymentId?: string;
      internalPaymentId: string;
      failureCode?: string;
      failureReason?: string;
      occurredAt: Date;
      payload: unknown;
    }
  | {
      type: "PAYMENT_REFUNDED";
      providerEventId: string;
      providerPaymentId: string;
      internalPaymentId: string;
      occurredAt: Date;
      payload: unknown;
    };

export type ProviderPaymentStatus =
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "REFUNDED"
  | "UNKNOWN";

export interface BillingProviderAdapter {
  readonly provider: BillingProvider;
  readonly capabilities: BillingProviderCapabilities;

  createCheckout(input: CreateProviderCheckoutInput): Promise<ProviderCheckout>;
  verifyWebhook(
    input: VerifyProviderWebhookInput,
  ): Promise<VerifiedProviderEvent>;
  getPaymentStatus?(
    providerPaymentId: string,
  ): Promise<ProviderPaymentStatus>;
}
