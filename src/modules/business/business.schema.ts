import { z } from "zod";
import { websiteContentSchema } from "../website-content/website-content.schema";

export const updateBusinessSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .openapi({ example: "Ahmed's Clinic" }),
    phone: z.string().max(30).optional().openapi({ example: "01012345678" }),
    address: z
      .string()
      .optional()
      .openapi({ example: "15 Tahrir Street, Downtown" }),
    city: z.string().optional().openapi({ example: "Cairo" }),
    vertical: z.string().optional().openapi({ example: "healthcare" }),
    timezone: z.string().optional().openapi({ example: "Africa/Cairo" }),
    language: z.string().optional().openapi({ example: "ar" }),
  })
  .openapi({ description: "Update business profile" });

export const createBusinessSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: "Ahmed's Clinic" }),
    slug: z.string().min(1).max(120).openapi({ example: "ahmeds-clinic" }),
    phone: z.string().min(1).max(30).openapi({ example: "01012345678" }),
    vertical: z.string().max(80).openapi({ example: "healthcare" }),
    address: z
      .string()
      .optional()
      .openapi({ example: "15 Tahrir Street, Downtown" }),
    city: z.string().max(120).optional().openapi({ example: "Cairo" }),
    timezone: z
      .string()
      .max(80)
      .optional()
      .openapi({ example: "Africa/Cairo" }),
    language: z.string().max(10).optional().openapi({ example: "ar" }),
    //: websiteContentSchema.optional(),
  })
  .openapi({ description: "Create a new business" });

export const publishBusinessSchema = z
  .object({
    isActive: z.boolean().openapi({ example: true }),
  })
  .openapi({ description: "Publish or unpublish a business" });

export const slugParamsSchema = z
  .object({
    slug: z.string().min(1).openapi({ example: "ahmeds-clinic" }),
  })
  .openapi({ description: "Business slug parameter" });

export type BusinessUpdateInput = z.infer<typeof updateBusinessSchema>;
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const businessStatsSchema = z.object({
  customersCount: z.number().int().nonnegative().openapi({ example: 42 }),
  appointmentsCount: z.number().int().nonnegative().openapi({ example: 156 }),
  servicesCount: z.number().int().nonnegative().openapi({ example: 8 }),
  staffCount: z.number().int().nonnegative().openapi({ example: 5 }),
  paidInvoiceCount: z.number().int().nonnegative().openapi({ example: 98 }),
  revenueCents: z.number().int().nonnegative().openapi({ example: 1500000 }),
  averageInvoiceValueCents: z
    .number()
    .int()
    .nonnegative()
    .openapi({ example: 15306 }),
  outstandingInvoiceCount: z
    .number()
    .int()
    .nonnegative()
    .openapi({ example: 12 }),
  outstandingInvoiceTotalCents: z
    .number()
    .int()
    .nonnegative()
    .openapi({ example: 180000 }),
  newCustomersCount: z.number().int().nonnegative().openapi({ example: 10 }),
  returningCustomersCount: z
    .number()
    .int()
    .nonnegative()
    .openapi({ example: 32 }),
  lapsedCustomersCount: z.number().int().nonnegative().openapi({ example: 8 }),
});

export type BusinessStats = z.infer<typeof businessStatsSchema>;

export const businessSchemas = {
  createBusinessSchema,
  updateBusinessSchema,
  publishBusinessSchema,
  slugParamsSchema,
  businessStatsSchema,
};
