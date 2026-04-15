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

export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;

export const parseUpdateBusiness = (input: unknown) =>
  updateBusinessSchema.parse(input);

export const parsePublishBusiness = (input: unknown) =>
  publishBusinessSchema.parse(input);
