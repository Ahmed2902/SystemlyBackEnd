import { z } from "zod";
import { websiteContentSchema } from "../website-content/website-content.schema";

export const updateBusinessSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  vertical: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
});

export const createBusinessSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(120),
  phone: z.string().min(1).max(30),
  vertical: z.string().max(80).optional(),
  address: z.string().optional(),
  city: z.string().max(120).optional(),
  timezone: z.string().max(80).optional(),
  language: z.string().max(10).optional(),
  websiteContent: websiteContentSchema.optional(),
});

export const publishBusinessSchema = z.object({
  isActive: z.boolean(),
});

export const slugParamsSchema = z.object({
  slug: z.string().min(1),
});

export type BusinessUpdateInput = z.infer<typeof updateBusinessSchema>;
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const businessStatsSchema = z.object({
  customersCount: z.number().int().nonnegative(),
  appointmentsCount: z.number().int().nonnegative(),
  servicesCount: z.number().int().nonnegative(),
  staffCount: z.number().int().nonnegative(),
  paidInvoiceCount: z.number().int().nonnegative(),
  revenueCents: z.number().int().nonnegative(),
  averageInvoiceValueCents: z.number().int().nonnegative(),
  outstandingInvoiceCount: z.number().int().nonnegative(),
  outstandingInvoiceTotalCents: z.number().int().nonnegative(),
  newCustomersCount: z.number().int().nonnegative(),
  returningCustomersCount: z.number().int().nonnegative(),
  lapsedCustomersCount: z.number().int().nonnegative(),
});

export type BusinessStats = z.infer<typeof businessStatsSchema>;

export const businessSchemas = {
  createBusinessSchema,
  updateBusinessSchema,
  publishBusinessSchema,
  slugParamsSchema,
  businessStatsSchema,
};
