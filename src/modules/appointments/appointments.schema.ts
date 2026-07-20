import { z } from "zod";

const manualServiceSelectionSchema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().min(1).optional(),
});

export const revertAppointmentSchema = z.object({
  businessId: z.string().min(1).openapi({ example: "biz-456" }),
});
export const revertAppointmentParamsSchema = z.object({
  appointmentId: z.string().min(1).openapi({ example: "apt-123" }),
});

export const updateAppointmentSchema = z.object({
  segments: z
    .array(
      z.object({
        id: z.string().uuid().optional(), // absent = new segment
        serviceId: z.string().uuid(),
        staffId: z.string().uuid(),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
      }),
    )
    .min(1, "Appointment must have at least one service"),
  customItems: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        description: z.string().min(1).max(255),
        priceCents: z.number().int().min(0),
      }),
    )
    .default([]),
  discountCents: z.number().int().min(0).default(0),
  notes: z.string().max(2000).optional(),
  clinical: z
    .object({
      notes: z.string().max(5000).optional(),
      diagnosis: z.string().max(2000).optional(),
      prescriptionJson: z.record(z.string(), z.any()).optional(),
    })
    .optional(),
});

export const listAppointmentsQuerySchema = z
  .object({
    date: z.string().optional().openapi({
      example: "2026-03-15",
      description: "Filter by specific date",
    }),
    from: z
      .string()
      .optional()
      .openapi({ example: "2026-03-01", description: "Start date range" }),
    to: z
      .string()
      .optional()
      .openapi({ example: "2026-03-31", description: "End date range" }),
    page: z.coerce.number().int().positive().optional().openapi({ example: 1 }),
    perPage: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .openapi({ example: 20 }),
  })
  .openapi({ description: "Query parameters for listing appointments" });

export const updateAppointmentStatusSchema = z
  .object({
    status: z
      .enum(["pending", "confirmed", "no_show"])
      .openapi({ example: "confirmed" }),
  })
  .openapi({ description: "Update appointment status" });

export const rescheduleAppointmentSchema = z
  .object({
    startsAt: z.string().min(1).openapi({ example: "2026-03-20T10:00:00Z" }),
  })
  .openapi({ description: "Reschedule an appointment" });

export const updateAppointmentNotesSchema = z
  .object({
    notes: z
      .string()
      .optional()
      .openapi({ example: "Patient requested morning appointment" }),
  })
  .openapi({ description: "Update appointment notes" });

export const createManualAppointmentSchema = z
  .object({
    services: z.array(manualServiceSelectionSchema).min(1),
    startsAt: z.string().min(1).openapi({ example: "2026-03-20T10:00:00Z" }),
    customerName: z.string().min(1).openapi({ example: "Mona Ahmed" }),
    customerPhone: z.string().min(4).openapi({ example: "01023456789" }),
    notes: z.string().optional().openapi({ example: "First visit" }),
    acquisitionSource: z.string().optional().openapi({ example: "website" }),
  })
  .openapi({ description: "Create a manual appointment" });

const finishPhotoSchema = z.object({
  url: z.url().openapi({ example: "https://res.cloudinary.com/.../photo.jpg" }),
  publicId: z.string().min(1).openapi({ example: "appointments/abc123" }),
  type: z.enum(["before", "after"]).openapi({ example: "after" }),
});

const finishClinicalSchema = z.object({
  notes: z
    .string()
    .max(5000)
    .optional()
    .openapi({ example: "Procedure completed successfully" }),
  diagnosis: z
    .string()
    .max(2000)
    .optional()
    .openapi({ example: "Caries removal" }),
  prescriptionJson: z.record(z.string(), z.any()).optional(),
});

export const finishAppointmentSchema = z
  .object({
    notes: z
      .string()
      .max(2000)
      .optional()
      .openapi({ example: "Patient satisfied" }),
    photos: z.array(finishPhotoSchema).max(20).optional(),
    clinical: finishClinicalSchema.optional(),
  })
  .openapi({
    description: "Finish an appointment with notes, photos, and clinical data",
  });

export const appointmentIdParamsSchema = z
  .object({
    appointmentId: z.string().min(1).openapi({ example: "apt-789" }),
  })
  .openapi({ description: "Appointment ID parameter" });

export const cancelAppointmentSchema = z
  .object({
    reason: z.string().max(500).optional(),
  })
  .openapi({ description: "Cancel an appointment (staff/business-initiated)" });

export type CancelAppointmentBody = z.infer<typeof cancelAppointmentSchema>;

export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;
export type UpdateAppointmentStatusBody = z.infer<
  typeof updateAppointmentStatusSchema
>;
export type UpdateAppointmentNotesBody = z.infer<
  typeof updateAppointmentNotesSchema
>;
export type CreateManualAppointmentBody = z.infer<
  typeof createManualAppointmentSchema
>;
export type FinishAppointmentInput = z.infer<typeof finishAppointmentSchema>;

export type RevertAppointmentInput = z.infer<typeof revertAppointmentSchema>;
export type UpdateAppointmentBody = z.infer<typeof updateAppointmentSchema>;
