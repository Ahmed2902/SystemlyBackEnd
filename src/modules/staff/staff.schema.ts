import { CommissionType, Roles, StaffTimeOffType } from "@prisma/client";
import { z } from "zod";

const commissionTypeEnum = z.nativeEnum(CommissionType);
const roleEnum = z.nativeEnum(Roles);
const timeOffTypeEnum = z.nativeEnum(StaffTimeOffType);

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must use HH:mm format");

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format");

const queryBooleanSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();

const commissionAmountSchema = z.number().min(0).multipleOf(0.01);

const validateCommission = (data: {
  commissionType: CommissionType;
  commissionAmount: number;
}) => {
  if (data.commissionType === CommissionType.NONE) return data.commissionAmount === 0;
  if (data.commissionType === CommissionType.PERCENT) {
    return data.commissionAmount > 0 && data.commissionAmount <= 100;
  }
  return data.commissionAmount >= 0;
};

export const staffDirectoryQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  status: z.enum(["all", "active", "inactive"]).default("all"),
  role: roleEnum.optional(),
  serviceId: z.string().uuid().optional(),
  availableToday: queryBooleanSchema,
  view: z.enum(["directory", "roster"]).default("directory"),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(24),
});

export const staffPaginationSchema = z.object({
  items: z.array(z.unknown()),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
});

export const createStaffSchema = z.object({
  branchId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(255).openapi({ example: "Dr. Mona Ahmed" }),
  role: z.literal(Roles.Staff).optional().default(Roles.Staff),
  jobTitle: optionalText(120).openapi({ example: "Lead Therapist" }),
  yearsExperience: z.number().int().min(0).max(80).nullable().optional(),
  bio: optionalText(4000).openapi({
    example: "Specializes in rehabilitation and sports recovery.",
  }),
  phone: optionalText(30).openapi({ example: "+201001234567" }),
  email: z.string().trim().email().nullable().optional().or(z.literal("")),
  photoUrl: z.string().url().nullable().optional().or(z.literal("")),
  isActive: z.boolean().optional().default(true),
  serviceIds: z.array(z.string().uuid()).optional().default([]),
});

export const updateStaffSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    role: z.literal(Roles.Staff).optional(),
    jobTitle: optionalText(120).nullable(),
    yearsExperience: z.number().int().min(0).max(80).nullable().optional(),
    bio: optionalText(4000).nullable(),
    phone: optionalText(30).nullable(),
    email: z.string().trim().email().nullable().optional().or(z.literal("")),
    photoUrl: z.string().url().nullable().optional().or(z.literal("")),
    isActive: z.boolean().optional(),
    serviceIds: z.array(z.string().uuid()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const assignServiceSchema = z
  .object({
    serviceId: z.string().uuid(),
    commissionType: commissionTypeEnum.optional().default(CommissionType.NONE),
    commissionAmount: commissionAmountSchema.optional().default(0),
  })
  .refine(validateCommission, {
    message:
      "Commission must be 0 for NONE, between 0.01 and 100 for PERCENT, and non-negative for FLAT",
  });

export const updateServiceStaffSchema = z
  .object({
    commissionType: commissionTypeEnum,
    commissionAmount: commissionAmountSchema,
  })
  .refine(validateCommission, {
    message:
      "Commission must be 0 for NONE, between 0.01 and 100 for PERCENT, and non-negative for FLAT",
  });

export const availabilityEntrySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeSchema,
    endTime: timeSchema,
    breakAfterMin: z.number().int().min(0).nullable().optional(),
  })
  .refine((entry) => entry.startTime < entry.endTime, {
    message: "Availability end time must be after start time",
  });

export const replaceAvailabilitySchema = z.array(availabilityEntrySchema);

export const overridesSchema = z
  .object({
    overrideDate: dateSchema,
    isDayOff: z.boolean().optional().default(false),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.isDayOff) return;
    if (!value.startTime || !value.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Start and end times are required unless the date is a day off",
      });
      return;
    }
    if (value.startTime >= value.endTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Override end time must be after start time",
      });
    }
  });

export const createStaffBreakSchema = z
  .object({
    breakDate: dateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    label: optionalText(100),
  })
  .refine((value) => value.startTime < value.endTime, {
    message: "Break end time must be after start time",
  });

export const createTimeOffSchema = z
  .object({
    startsOn: dateSchema,
    endsOn: dateSchema,
    type: timeOffTypeEnum.optional().default(StaffTimeOffType.VACATION),
    label: optionalText(120),
    notes: optionalText(2000),
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "Time off end date must be on or after the start date",
  });

export const createInviteSchema = z
  .object({
    email: z.string().trim().email(),
    branchId: z.string().uuid(),
    role: z.literal(Roles.Receptionist).optional().default(Roles.Receptionist),
    expiresInDays: z.number().int().min(1).max(30).optional(),
  })
  .strict();

export const acceptInviteSchema = z.object({ token: z.string().min(1) }).strict();

export type StaffCreateInput = z.infer<typeof createStaffSchema>;
export type StaffUpdateInput = z.infer<typeof updateStaffSchema>;
export type StaffWorkspaceCreateInput = StaffCreateInput;
export type StaffWorkspaceUpdateInput = StaffUpdateInput;
export type StaffDirectoryQuery = z.infer<typeof staffDirectoryQuerySchema>;
export type AssignServiceInput = z.infer<typeof assignServiceSchema>;
export type UpdateServiceStaffInput = z.infer<typeof updateServiceStaffSchema>;
export type AvailabilityEntry = z.infer<typeof availabilityEntrySchema>;
export type AvailabilityOverrideInput = z.infer<typeof overridesSchema>;
export type StaffBreakInput = z.infer<typeof createStaffBreakSchema>;
export type StaffTimeOffInput = z.infer<typeof createTimeOffSchema>;
export type StaffListResult = z.infer<typeof staffPaginationSchema>;
export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const staffSchemas = {
  staffDirectoryQuerySchema,
  staffPaginationSchema,
  createStaffSchema,
  updateStaffSchema,
  assignServiceSchema,
  updateServiceStaffSchema,
  availabilityEntrySchema,
  replaceAvailabilitySchema,
  overridesSchema,
  createStaffBreakSchema,
  createTimeOffSchema,
  createInviteSchema,
  acceptInviteSchema,
};