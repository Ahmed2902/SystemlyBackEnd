import { z } from "zod";

export const listAppointmentsQuery = z.object({
  date: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().optional(),
  perPage: z.coerce.number().optional(),
});

export const updateStatusSchema = z.object({
  status: z.string().min(1),
});

export const updateNotesSchema = z.object({
  notes: z.string().optional(),
});

export const createManualSchema = z.object({
  businessId: z.string().min(1),
  serviceId: z.string().min(1),
  staffId: z.string().min(1),
  startsAt: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(4),
  notes: z.string().optional(),
});

export default {
  listAppointmentsQuery,
  updateStatusSchema,
  updateNotesSchema,
  createManualSchema,
};
