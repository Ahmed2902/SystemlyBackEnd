import { z } from "zod";

export const createServiceSchema = z
  .object({
    name: z.string().min(1).max(255).openapi({ example: "Teeth Whitening" }),
    durationMin: z.number().int().min(1).openapi({ example: 60 }),
    priceEgp: z.number().nonnegative().openapi({ example: 50000 }),
    description: z
      .string()
      .optional()
      .openapi({ example: "Professional teeth whitening session" }),
    isActive: z.boolean().optional().openapi({ example: true }),
    category: z.string().max(80).optional().openapi({ example: "Cosmetic" }),
  })
  .openapi({ description: "Create a new service" });

export const updateServiceSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(255)
      .optional()
      .openapi({ example: "Teeth Whitening Deluxe" }),
    durationMin: z.number().int().min(1).optional().openapi({ example: 90 }),
    priceEgp: z.number().nonnegative().optional().openapi({ example: 75000 }),
    description: z
      .string()
      .optional()
      .openapi({ example: "Premium whitening with LED" }),
    isActive: z.boolean().optional().openapi({ example: true }),
    category: z.string().max(80).optional().openapi({ example: "Cosmetic" }),
  })
  .openapi({ description: "Update an existing service" });

export type CreateServiceBody = z.infer<typeof createServiceSchema>;
export type UpdateServiceBody = z.infer<typeof updateServiceSchema>;

export const servicesSchemas = {
  createServiceSchema,
  updateServiceSchema,
};
