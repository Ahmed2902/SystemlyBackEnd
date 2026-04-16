import { z } from "zod";

export const listQuerySchema = z.object({
  search: z.string().optional(),
  page: z.string().optional(),
});

export const updateNotesSchema = z.object({ notes: z.string().optional() });
