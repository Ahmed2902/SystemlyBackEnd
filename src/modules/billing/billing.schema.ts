import { z } from "zod";

export const subscriptionActionBodySchema = z
  .object({
    planId: z.string().uuid().optional(),
  })
  .strict();

export const billingPaymentsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    perPage: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export const billingPaymentParamsSchema = z
  .object({
    paymentId: z.string().uuid(),
  })
  .strict();

export type SubscriptionActionBody = z.infer<
  typeof subscriptionActionBodySchema
>;
export type BillingPaymentsQuery = z.infer<
  typeof billingPaymentsQuerySchema
>;

export const billingSchemas = {
  subscriptionActionBodySchema,
  billingPaymentsQuerySchema,
  billingPaymentParamsSchema,
};
