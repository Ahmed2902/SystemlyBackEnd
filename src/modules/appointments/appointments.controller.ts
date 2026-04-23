import type { NextFunction, Request, Response } from "express";
import * as service from "./appointments.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  appointmentIdParamsSchema,
  createManualAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentNotesSchema,
  updateAppointmentStatusSchema,
} from "./appointments.schema";

export const listAppointments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = listAppointmentsQuerySchema.safeParse(req.query);
    if (!parsed.success) return next(parsed.error);
    const user = req.user;
    if (!user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
    const data = await service.listAppointments({
      user,
      date: parsed.data.date,
      from: parsed.data.from,
      to: parsed.data.to,
      page: parsed.data.page,
      perPage: parsed.data.perPage,
    });
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const getAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = appointmentIdParamsSchema.safeParse(req.params);
    if (!parsed.success) return next(parsed.error);
    const appt = await service.getAppointmentById(parsed.data.id);
    if (!appt) return fail(res, "Not found", 404);
    return ok(res, appt);
  } catch (err) {
    return next(err);
  }
};

export const updateStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const paramsParsed = appointmentIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return next(paramsParsed.error);
    const bodyParsed = updateAppointmentStatusSchema.safeParse(req.body);
    if (!bodyParsed.success) return next(bodyParsed.error);
    const updated = await service.updateStatus(
      paramsParsed.data.id,
      bodyParsed.data.status
    );
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
};

export const updateNotes = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const paramsParsed = appointmentIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return next(paramsParsed.error);
    const bodyParsed = updateAppointmentNotesSchema.safeParse(req.body);
    if (!bodyParsed.success) return next(bodyParsed.error);
    const updated = await service.updateNotes(
      paramsParsed.data.id,
      bodyParsed.data.notes
    );
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
};

export const createAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = createManualAppointmentSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const created = await service.createManualAppointment(parsed.data);
    return ok(res, created, 201);
  } catch (err) {
    return next(err);
  }
};

export const rescheduleAppointment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const paramsParsed = appointmentIdParamsSchema.safeParse(req.params);
    if (!paramsParsed.success) return next(paramsParsed.error);
    const bodyParsed = (await import("./appointments.schema"))
      .rescheduleAppointmentSchema.safeParse(req.body);
    if (!bodyParsed.success) return next(bodyParsed.error);
    const updated = await service.rescheduleAppointment(
      paramsParsed.data.id,
      bodyParsed.data.startsAt
    );
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
};

export default {
  listAppointments,
  getAppointment,
  updateStatus,
  updateNotes,
  createAppointment,
  rescheduleAppointment,
};
