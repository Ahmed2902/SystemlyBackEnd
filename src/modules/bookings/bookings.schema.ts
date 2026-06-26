import { z } from "zod";

export const availabilityQuerySchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().optional(),
  date: z.string().min(1),
  timezone: z.string().optional(),
});

export const createBookingSchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().optional().nullable(),
  startsAt: z.string().min(1),
  timezone: z.string().optional(),
  customerName: z.string().min(1),
  customerPhone: z.string().min(4),
  notes: z.string().optional(),
  acquisitionSource: z.string().optional(),
});

export const bookingTokenParamsSchema = z.object({
  token: z.string().min(1),
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type CreateBookingBody = z.infer<typeof createBookingSchema>;

export const bookingsSchemas = {
  availabilityQuerySchema,
  createBookingSchema,
  bookingTokenParamsSchema,
};
