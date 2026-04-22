import { z } from "zod";

export const subscriptionActionBodySchema = z.object({
  businessId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
});

export const billingWebhookBodySchema = z.unknown();

export type SubscriptionActionBody = z.infer<typeof subscriptionActionBodySchema>;

export const billingSchemas = {
  subscriptionActionBodySchema,
  billingWebhookBodySchema,
};
