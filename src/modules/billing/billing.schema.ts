import { z } from "zod";

export const subscriptionActionBodySchema = z
  .object({
    planId: z.string().uuid().optional(),
  })
  .strict();

export type SubscriptionActionBody = z.infer<
  typeof subscriptionActionBodySchema
>;

export const billingSchemas = {
  subscriptionActionBodySchema,
};
