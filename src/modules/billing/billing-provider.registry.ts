import { BillingProvider } from "@prisma/client";
import type { BillingProviderAdapter } from "./billing-provider.types";
import { EasyKashAdapter } from "./providers/easykash.adapter";

export interface BillingProviderResolver {
  get(provider: BillingProvider): BillingProviderAdapter;
}

export class BillingProviderRegistry implements BillingProviderResolver {
  private readonly adapters: Map<BillingProvider, BillingProviderAdapter>;

  constructor(adapters: BillingProviderAdapter[]) {
    this.adapters = new Map(
      adapters.map((adapter) => [adapter.provider, adapter]),
    );
  }

  get(provider: BillingProvider) {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      const error = new Error(`Billing provider ${provider} is not registered.`) as Error & {
        statusCode?: number;
        code?: string;
      };
      error.statusCode = 500;
      error.code = "BILLING_PROVIDER_NOT_REGISTERED";
      throw error;
    }
    return adapter;
  }
}

export const billingProviderRegistry = new BillingProviderRegistry([
  new EasyKashAdapter(),
]);
