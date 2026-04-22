import { z } from "zod";

export const createServiceSchema = z.object({
  name: z.string().min(1).max(255),
  durationMin: z.number().int().min(1),
  priceEgp: z.number().nonnegative(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateServiceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  durationMin: z.number().int().min(1).optional(),
  priceEgp: z.number().nonnegative().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export type CreateServiceBody = z.infer<typeof createServiceSchema>;
export type UpdateServiceBody = z.infer<typeof updateServiceSchema>;

export const servicesSchemas = {
  createServiceSchema,
  updateServiceSchema,
};
