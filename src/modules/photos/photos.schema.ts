import { z } from "zod";

export const photoIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const businessMediaKindParamsSchema = z.object({
  kind: z.enum(["logo", "cover", "gallery"]),
});

export const mediaPresignSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export const mediaConfirmSchema = z
  .object({
    objectPath: z.string().min(1).optional(),
    publicId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.objectPath ?? value.publicId), {
    message: "objectPath is required",
  });

export const photosSchemas = {
  photoIdParamsSchema,
  businessMediaKindParamsSchema,
  mediaPresignSchema,
  mediaConfirmSchema,
};
