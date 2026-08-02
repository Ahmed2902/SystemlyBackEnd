import { InvoiceStatus, PaymentMethod } from "@prisma/client";
import { z } from "zod";
import { updateAppointmentSchema } from "../appointments/appointments.schema";

export const invoiceStatusFilterSchema = z.enum([
  InvoiceStatus.paid,
  InvoiceStatus.voided,
]);

export const listInvoicesQuerySchema = z.object({
  search: z.string().trim().max(255).optional(),
  status: invoiceStatusFilterSchema.optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(30),
});

export const collectPaymentSchema = z.object({
  appointmentId: z.string().uuid(),
  discountCents: z.number().int().nonnegative().default(0),
  paymentMethod: z.nativeEnum(PaymentMethod),
  paymentReference: z.string().trim().max(255).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  appointmentUpdate: updateAppointmentSchema.optional(),
});

export const voidInvoiceSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export const invoiceIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type CollectPaymentInput = z.infer<typeof collectPaymentSchema>;
export type VoidInvoiceInput = z.infer<typeof voidInvoiceSchema>;
