import { z } from "zod";

const serviceSelectionSchema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().optional(),
});

const optionalDateOfBirth = z
  .string()
  .date()
  .optional()
  .refine(
    (value) => !value || new Date(`${value}T00:00:00.000Z`).getTime() <= Date.now(),
    "Date of birth cannot be in the future",
  );

export const availabilityQuerySchema = z
  .object({
    businessId: z.string().min(1).openapi({ example: "biz-123" }),
    services: z.preprocess(
      (val) => (typeof val === "string" ? JSON.parse(val) : val),
      z.array(serviceSelectionSchema).min(1),
    ),
    staffId: z.string().optional().openapi({ example: "staff-789" }),
    date: z.string().min(1).openapi({ example: "2026-03-20" }),
  })
  .openapi({
    description:
      "Query parameters for checking staff availability. Times are interpreted in the business timezone.",
  });

export const createBookingSchema = z
  .object({
    businessId: z.string().min(1).openapi({ example: "biz-123" }),
    services: z.array(serviceSelectionSchema).min(1),
    staffId: z.string().optional().nullable().openapi({ example: "staff-789" }),
    startsAt: z.string().min(1).openapi({ example: "2026-03-20T10:00:00" }),
    customerName: z.string().min(1).openapi({ example: "Sara Ali" }),
    customerPhone: z.string().min(4).openapi({ example: "01098765432" }),
    dateOfBirth: optionalDateOfBirth.openapi({ example: "1994-05-20" }),
    gender: z.enum(["male", "female"]).optional().openapi({ example: "female" }),
    notes: z
      .string()
      .optional()
      .openapi({ example: "Prefers afternoon slots" }),
    acquisitionSource: z.string().optional().openapi({ example: "google" }),
  })
  .openapi({
    description:
      "Create a confirmed public booking. Local times are interpreted in the business timezone and persisted as UTC instants.",
  });

export const bookingTokenParamsSchema = z
  .object({
    token: z.string().min(1).openapi({ example: "booking-token-abc" }),
  })
  .openapi({ description: "Booking cancellation token parameter" });

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type CreateBookingBody = z.infer<typeof createBookingSchema>;

export const bookingsSchemas = {
  availabilityQuerySchema,
  createBookingSchema,
  bookingTokenParamsSchema,
};
