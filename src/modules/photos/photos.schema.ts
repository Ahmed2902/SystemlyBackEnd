import { z } from "zod";

export const photoIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const photosSchemas = {
  photoIdParamsSchema,
};
