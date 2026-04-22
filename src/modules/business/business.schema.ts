import { z } from "zod";

export const updateBusinessSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  vertical: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
});

export const publishBusinessSchema = z.object({
  isActive: z.boolean(),
});

export const slugParamsSchema = z.object({
  slug: z.string().min(1),
});

export type BusinessUpdateInput = z.infer<typeof updateBusinessSchema>;

export const businessStatsSchema = z.object({
  customersCount: z.number().int().nonnegative(),
  appointmentsCount: z.number().int().nonnegative(),
  servicesCount: z.number().int().nonnegative(),
  staffCount: z.number().int().nonnegative(),
});

export type BusinessStats = z.infer<typeof businessStatsSchema>;

export const businessSchemas = {
  updateBusinessSchema,
  publishBusinessSchema,
  slugParamsSchema,
  businessStatsSchema,
};
