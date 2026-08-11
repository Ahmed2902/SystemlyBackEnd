import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

const branchFields = {
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  phone: optionalText(30),
  address: z.string().trim().nullable().optional(),
  city: optionalText(120),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  timezone: z.string().trim().min(1).max(80).default("Africa/Cairo"),
};

export const branchIdParamsSchema = z.object({
  branchId: z.string().uuid(),
});

export const createBranchSchema = z.object(branchFields).strict();

export const updateBranchSchema = z
  .object({
    name: branchFields.name.optional(),
    slug: branchFields.slug.optional(),
    phone: branchFields.phone,
    address: branchFields.address,
    city: branchFields.city,
    lat: branchFields.lat,
    lng: branchFields.lng,
    timezone: branchFields.timezone.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
