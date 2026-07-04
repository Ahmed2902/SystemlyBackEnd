import { z } from "zod";

export const availabilityQuerySchema = z
  .object({
    businessId: z.string().min(1).openapi({ example: "biz-123" }),
    serviceId: z.string().min(1).openapi({ example: "svc-456" }),
    staffId: z.string().optional().openapi({ example: "staff-789" }),
    date: z.string().min(1).openapi({ example: "2026-03-20" }),
    timezone: z.string().optional().openapi({ example: "Africa/Cairo" }),
  })
  .openapi({ description: "Query parameters for checking staff availability" });

export const createBookingSchema = z
  .object({
    businessId: z.string().min(1).openapi({ example: "biz-123" }),
    serviceId: z.string().min(1).openapi({ example: "svc-456" }),
    staffId: z.string().optional().nullable().openapi({ example: "staff-789" }),
    startsAt: z.string().min(1).openapi({ example: "2026-03-20T10:00:00Z" }),
    timezone: z.string().optional().openapi({ example: "Africa/Cairo" }),
    customerName: z.string().min(1).openapi({ example: "Sara Ali" }),
    customerPhone: z.string().min(4).openapi({ example: "01098765432" }),
    notes: z
      .string()
      .optional()
      .openapi({ example: "Prefers afternoon slots" }),
    acquisitionSource: z.string().optional().openapi({ example: "google" }),
  })
  .openapi({ description: "Create a new booking" });

export const bookingTokenParamsSchema = z
  .object({
    token: z.string().min(1).openapi({ example: "booking-token-abc" }),
  })
  .openapi({ description: "Booking token parameter" });

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type CreateBookingBody = z.infer<typeof createBookingSchema>;

export const bookingsSchemas = {
  availabilityQuerySchema,
  createBookingSchema,
  bookingTokenParamsSchema,
};
