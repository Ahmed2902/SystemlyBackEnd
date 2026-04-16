import { z } from "zod";

export const createFaqSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  displayOrder: z.number().int().optional(),
});

export const updateFaqSchema = z.object({
  question: z.string().min(1).optional(),
  answer: z.string().min(1).optional(),
  displayOrder: z.number().int().optional(),
});

export const reorderSchema = z.array(
  z.object({ id: z.string().uuid(), display_order: z.number().int() })
);

export const parseCreateFaq = (input: unknown) => createFaqSchema.parse(input);
export const parseUpdateFaq = (input: unknown) => updateFaqSchema.parse(input);
export const parseReorder = (input: unknown) => reorderSchema.parse(input);
