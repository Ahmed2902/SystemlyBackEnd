import { Roles, CommissionType } from "@prisma/client";
import { z } from "zod";

const commissionTypeEnum = z.nativeEnum(CommissionType);

export const createStaffSchema = z.object({
  name: z.string().min(1).max(255).openapi({ example: "Dr. Mona Ahmed" }),
  role: z.enum(Roles).optional().openapi({ example: Roles.Staff }),
  photoUrl: z
    .string()
    .url()
    .optional()
    .openapi({ example: "https://res.cloudinary.com/.../staff.jpg" }),
  isActive: z.boolean().optional().openapi({ example: true }),
});

export const updateStaffSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .openapi({ example: "Dr. Mona Ahmed" }),
  role: z.enum(Roles).optional().openapi({ example: Roles.Staff }),
  photoUrl: z
    .string()
    .url()
    .optional()
    .openapi({ example: "https://res.cloudinary.com/.../staff.jpg" }),
  isActive: z.boolean().optional().openapi({ example: true }),
});

export const assignServiceSchema = z
  .object({
    serviceId: z
      .string()
      .uuid()
      .openapi({ example: "123e4567-e89b-12d3-a456-426614174000" }),
    commissionType: commissionTypeEnum
      .optional()
      .default(CommissionType.NONE)
      .openapi({ example: CommissionType.PERCENT }),
    commissionAmount: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .openapi({ example: 30 }),
  })
  .refine(
    (data) => {
      if (data.commissionType === CommissionType.NONE) {
        return data.commissionAmount === 0;
      }
      if (data.commissionType === CommissionType.PERCENT) {
        return data.commissionAmount >= 0 && data.commissionAmount <= 100;
      }
      return data.commissionAmount >= 0;
    },
    {
      message:
        "commissionAmount must be 0 when type is NONE, and between 0-100 when type is PERCENT",
    },
  );

export const updateServiceStaffSchema = z
  .object({
    commissionType: commissionTypeEnum.openapi({
      example: CommissionType.PERCENT,
    }),
    commissionAmount: z.number().int().min(0).openapi({ example: 30 }),
  })
  .refine(
    (data) => {
      if (data.commissionType === CommissionType.NONE) {
        return data.commissionAmount === 0;
      }
      if (data.commissionType === CommissionType.PERCENT) {
        return data.commissionAmount >= 0 && data.commissionAmount <= 100;
      }
      return true;
    },
    {
      message:
        "commissionAmount must be 0 when type is NONE, and between 0-100 when type is PERCENT",
    },
  );

export const availabilityEntrySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).openapi({ example: 1 }),
  startTime: z.string().min(1).openapi({ example: "09:00" }),
  endTime: z.string().min(1).openapi({ example: "17:00" }),
  breakAfterMin: z.number().optional().openapi({ example: 30 }),
});

export const replaceAvailabilitySchema = z
  .array(availabilityEntrySchema)
  .openapi({ description: "Replace staff availability schedule" });

export const overridesSchema = z.object({
  overrideDate: z.string().min(1).openapi({ example: "2026-03-25" }),
  isDayOff: z.boolean().optional().openapi({ example: false }),
  startTime: z.string().optional().openapi({ example: "10:00" }),
  endTime: z.string().optional().openapi({ example: "14:00" }),
});

export const staffPaginationSchema = z.object({
  items: z.array(z.unknown()),
  total: z.number().int().nonnegative().openapi({ example: 42 }),
  page: z.number().int().positive().openapi({ example: 1 }),
  perPage: z.number().int().positive().openapi({ example: 20 }),
});

export type StaffCreateInput = z.infer<typeof createStaffSchema>;
export type StaffUpdateInput = z.infer<typeof updateStaffSchema>;
export type AssignServiceInput = z.infer<typeof assignServiceSchema>;
export type UpdateServiceStaffInput = z.infer<typeof updateServiceStaffSchema>;
export type AvailabilityEntry = z.infer<typeof availabilityEntrySchema>;
export type AvailabilityOverrideInput = z.infer<typeof overridesSchema>;
export type StaffListResult = z.infer<typeof staffPaginationSchema>;

export const staffSchemas = {
  createStaffSchema,
  updateStaffSchema,
  assignServiceSchema,
  updateServiceStaffSchema,
  availabilityEntrySchema,
  replaceAvailabilitySchema,
  overridesSchema,
  staffPaginationSchema,
};

export const createInviteSchema = z.object({
  email: z.string().email().openapi({ example: "staff@clinic.com" }),
  role: z.enum(Roles).openapi({ example: Roles.Staff }),
  expiresInDays: z.number().int().positive().optional().openapi({ example: 7 }),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1).openapi({ example: "invite-token-xyz" }),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
