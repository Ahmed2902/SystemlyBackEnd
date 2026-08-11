import { z } from "zod";

export const UNCATEGORIZED_FILTER = "__uncategorized__";

const categorySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .transform((value) => value.replace(/\s+/g, " "));

const staffIdsSchema = z.array(z.string().uuid()).default([]);

const serviceDurationSchema = z
  .number()
  .int()
  .min(5)
  .refine((value) => value % 5 === 0, {
    message: "Duration must be in 5-minute increments",
  });

// #region Query schemas
export const listServicesQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  view: z.enum(["catalog", "booking"]).default("catalog"),
});
// #endregion

// #region Command schemas
export const createServiceSchema = z
  .object({
    branchId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(255).openapi({ example: "Teeth Whitening" }),
    durationMin: serviceDurationSchema.openapi({ example: 60 }),
    priceEgp: z.number().nonnegative().optional().openapi({ example: 500 }),
    description: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .openapi({ example: "Professional teeth whitening session" }),
    isActive: z.boolean().default(true).openapi({ example: true }),
    category: categorySchema.optional().openapi({ example: "Cosmetic" }),
    staffIds: staffIdsSchema,
  })
  .openapi({ description: "Create a new service" });

export const updateServiceSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .openapi({ example: "Teeth Whitening Deluxe" }),
    durationMin: serviceDurationSchema.optional().openapi({ example: 90 }),
    priceEgp: z.number().nonnegative().optional().openapi({ example: 750 }),
    description: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .optional()
      .openapi({ example: "Premium whitening with LED" }),
    isActive: z.boolean().optional().openapi({ example: true }),
    category: categorySchema.nullable().optional().openapi({ example: "Cosmetic" }),
    staffIds: z.array(z.string().uuid()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  })
  .openapi({ description: "Update an existing service" });
// #endregion

export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;
export type CreateServiceBody = z.infer<typeof createServiceSchema>;
export type UpdateServiceBody = z.infer<typeof updateServiceSchema>;

export const servicesSchemas = {
  listServicesQuerySchema,
  createServiceSchema,
  updateServiceSchema,
};
