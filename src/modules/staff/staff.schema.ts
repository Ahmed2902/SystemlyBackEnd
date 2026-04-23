import { Roles } from "@prisma/client";
import { z } from "zod";

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
export type AvailabilityEntry = z.infer<typeof availabilityEntrySchema>;
export type AvailabilityOverrideInput = z.infer<typeof overridesSchema>;
export type StaffListResult = z.infer<typeof staffPaginationSchema>;

export const staffSchemas = {
  createStaffSchema,
  updateStaffSchema,
  availabilityEntrySchema,
  replaceAvailabilitySchema,
  overridesSchema,
  staffPaginationSchema,
};

export const createInviteSchema = z.object({
  email: z.email(),
  role: z.enum(Roles),
  expiresInDays: z.number().int().positive().optional(),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
