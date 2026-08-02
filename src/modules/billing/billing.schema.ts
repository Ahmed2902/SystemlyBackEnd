import { z } from "zod";

export const subscriptionActionBodySchema = z
  .object({
    planId: z.string().uuid().optional(),
  })
  .strict();

export const billingWebhookBodySchema = z.unknown();

export type SubscriptionActionBody = z.infer<
  typeof subscriptionActionBodySchema
>;

export const billingSchemas = {
  subscriptionActionBodySchema,
  billingWebhookBodySchema,
};
