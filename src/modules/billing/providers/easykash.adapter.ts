import { BillingProvider } from "@prisma/client";
import type {
  BillingProviderAdapter,
  CreateProviderCheckoutInput,
  ProviderCheckout,
  VerifiedProviderEvent,
  VerifyProviderWebhookInput,
} from "../billing-provider.types";

export function billingProviderNotConfigured() {
  const error = new Error("EasyKash billing is not configured.") as Error & {
    statusCode?: number;
    code?: string;
  };
  error.statusCode = 503;
  error.code = "BILLING_PROVIDER_NOT_CONFIGURED";
  return error;
}

export class EasyKashAdapter implements BillingProviderAdapter {
  readonly provider = BillingProvider.EASYKASH;
  readonly capabilities = {
    checkout: false,
    webhookVerification: false,
    paymentLookup: false,
    automaticRenewal: false,
    refunds: false,
  } as const;

  async createCheckout(
    _input: CreateProviderCheckoutInput,
  ): Promise<ProviderCheckout> {
    throw billingProviderNotConfigured();
  }

  async verifyWebhook(
    _input: VerifyProviderWebhookInput,
  ): Promise<VerifiedProviderEvent> {
    throw billingProviderNotConfigured();
  }
}
