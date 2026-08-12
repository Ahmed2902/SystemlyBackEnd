import { z } from "zod";

const nullableText = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]).optional();

export const updateBusinessSettingsSchema = z.object({
  name: z.string().trim().min(1).max(255),
  language: z.enum(["en", "ar"]),
});

export const updateWebsiteSettingsSchema = z.object({
  tagline: nullableText(500),
  aboutText: nullableText(5000),
  template: nullableText(80),
  primaryColor: nullableText(30),
  secondaryColor: nullableText(30),
  font: nullableText(80),
  showTeam: z.boolean(),
  showFaq: z.boolean(),
  showReviews: z.boolean(),
  metaTitle: nullableText(255),
  metaDescription: nullableText(500),
  instagramUrl: nullableText(255),
  whatsappNumber: nullableText(30),
});

export const publishSettingsSchema = z.object({
  isActive: z.boolean(),
});

export const brandingKindParamsSchema = z.object({
  kind: z.enum(["logo", "cover"]),
});

export const brandingPresignSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export const brandingConfirmSchema = z
  .object({
    objectPath: z.string().min(1).optional(),
    publicId: z.string().min(1).optional(),
    publicUrl: z.string().url().optional(),
  })
  .refine((value) => Boolean(value.objectPath ?? value.publicId), {
    message: "objectPath is required",
  });

export type UpdateBusinessSettingsInput = z.infer<
  typeof updateBusinessSettingsSchema
>;
export type UpdateWebsiteSettingsInput = z.infer<
  typeof updateWebsiteSettingsSchema
>;
