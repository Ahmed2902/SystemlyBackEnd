import { z } from "zod";

export const createStaffSchema = z.object({
  name: z.string().min(1).max(255),
  role: z.string().optional(),
  photoUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

export const updateStaffSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.string().optional(),
  photoUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

export const availabilityEntrySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  breakAfterMin: z.number().optional(),
});

export const overridesSchema = z.object({
  overrideDate: z.string().min(1), // expect YYYY-MM-DD or ISO date
  isDayOff: z.boolean().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export const parseCreateStaff = (input: unknown) =>
  createStaffSchema.parse(input);
export const parseUpdateStaff = (input: unknown) =>
  updateStaffSchema.parse(input);
export const parseAvailabilityArray = (input: unknown) =>
  z.array(availabilityEntrySchema).parse(input);
export const parseOverride = (input: unknown) => overridesSchema.parse(input);
