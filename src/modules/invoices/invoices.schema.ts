import { z } from "zod";

export const checkoutBodySchema = z.object({
  appointmentId: z.string().uuid(),
});

export const markPaidParamsSchema = z.object({
  id: z.string().uuid(),
});

export const receiptParamsSchema = z.object({
  id: z.string().uuid(),
});

export type CheckoutBody = z.infer<typeof checkoutBodySchema>;
