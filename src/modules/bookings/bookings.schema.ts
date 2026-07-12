import { z } from "zod";

const serviceIdsSchema = z.preprocess(
  (val) => (typeof val === "string" ? val.split(",").filter(Boolean) : val),
  z.array(z.string().min(1)).min(1),
);

const serviceSelectionSchema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().optional(), // if omitted, auto-assign any capable+available staff
});

export const availabilityQuerySchema = z
  .object({
    businessId: z.string().min(1).openapi({ example: "biz-123" }),
    services: z.preprocess(
      (val) => (typeof val === "string" ? JSON.parse(val) : val),
      z.array(serviceSelectionSchema).min(1),
    ),
    staffId: z.string().optional().openapi({ example: "staff-789" }),
    date: z.string().min(1).openapi({ example: "2026-03-20" }),
    timezone: z.string().optional().openapi({ example: "Africa/Cairo" }),
  })
  .openapi({ description: "Query parameters for checking staff availability" });

export const createBookingSchema = z
  .object({
    businessId: z.string().min(1).openapi({ example: "biz-123" }),
    services: z.array(serviceSelectionSchema).min(1),

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
