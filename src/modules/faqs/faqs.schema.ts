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

export const reorderFaqsSchema = z.array(
  z.object({ id: z.string().uuid(), display_order: z.number().int() })
);

export type CreateFaqBody = z.infer<typeof createFaqSchema>;
export type UpdateFaqBody = z.infer<typeof updateFaqSchema>;
export type ReorderFaqsBody = z.infer<typeof reorderFaqsSchema>;

export const faqsSchemas = {
  createFaqSchema,
  updateFaqSchema,
  reorderFaqsSchema,
};
