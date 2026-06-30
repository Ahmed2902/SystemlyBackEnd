import { z } from "zod";

export const listAppointmentsQuerySchema = z.object({
  date: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().optional(),
});

export const updateAppointmentStatusSchema = z.object({
  status: z.string().min(1),
});

export const rescheduleAppointmentSchema = z.object({
  startsAt: z.string().min(1),
});

export const updateAppointmentNotesSchema = z.object({
  notes: z.string().optional(),
});

export const createManualAppointmentSchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().min(1),
  startsAt: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(4),
  notes: z.string().optional(),
  acquisitionSource: z.string().optional(),
});

const finishPhotoSchema = z.object({
  url: z.string().url(),
  publicId: z.string().min(1),
  type: z.enum(["before", "after"]),
});

const finishClinicalSchema = z.object({
  notes: z.string().max(5000).optional(),
  diagnosis: z.string().max(2000).optional(),
  prescriptionJson: z.record(z.string(), z.any()).optional(),
});

export const finishAppointmentSchema = z.object({
  notes: z.string().max(2000).optional(),
  photos: z.array(finishPhotoSchema).max(20).optional(),
  clinical: finishClinicalSchema.optional(),
});

export const appointmentIdParamsSchema = z.object({
  id: z.string().min(1),
});

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
