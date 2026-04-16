import { z } from "zod";

export const availabilityQuerySchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().optional(),
  date: z.string().min(1), // expect YYYY-MM-DD
  timezone: z.string().optional(),
});

export const createBookingSchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().optional().nullable(),
  startsAt: z.string().min(1), // ISO datetime or client-local with timezone
  timezone: z.string().optional(),
  customerName: z.string().min(1),
  customerPhone: z.string().min(4),
  notes: z.string().optional(),
});

export default { availabilityQuerySchema, createBookingSchema };
