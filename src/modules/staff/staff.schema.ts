import { Roles, CommissionType } from "@prisma/client";
import { z } from "zod";

const commissionTypeEnum = z.nativeEnum(CommissionType);

export const createStaffSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.enum(Roles).optional(),
  photoUrl: z.url().optional(),
  isActive: z.boolean().optional(),
});

export const updateStaffSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.enum(Roles).optional(),
  photoUrl: z.url().optional(),
  isActive: z.boolean().optional(),
});

export const assignServiceSchema = z.object({
  serviceId: z.string().uuid(),
  commissionType: commissionTypeEnum.optional().default(CommissionType.NONE),
  commissionAmount: z.number().int().min(0).optional().default(0),
}).refine(
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
    commissionType: commissionTypeEnum,
    commissionAmount: z.number().int().min(0),
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
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  breakAfterMin: z.number().optional(),
});

export const replaceAvailabilitySchema = z.array(availabilityEntrySchema);

export const overridesSchema = z.object({
  overrideDate: z.string().min(1),
  isDayOff: z.boolean().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export const staffPaginationSchema = z.object({
  items: z.array(z.unknown()),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
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
  email: z.string().email(),
  role: z.enum(Roles),
  expiresInDays: z.number().int().positive().optional(),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
