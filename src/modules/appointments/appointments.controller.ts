import type { NextFunction, Request, Response } from "express";
import appointmentsService from "./appointments.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  appointmentIdParamsSchema,
  createManualAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentNotesSchema,
  updateAppointmentStatusSchema,
  finishAppointmentSchema,
  cancelAppointmentSchema,
} from "./appointments.schema";
import { isModuleEnabled } from "../../shared/config/verticals.config";

class AppointmentsController {
  async listAppointments(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listAppointmentsQuerySchema.safeParse(req.query);
      if (!parsed.success) return next(parsed.error);
      const user = req.user;
      if (!user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      const data = await appointmentsService.listAppointments({
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
  }

  async getAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const appt = await appointmentsService.getAppointmentById(parsed.data.id);
      if (!appt) return fail(res, "Not found", 404);
      return ok(res, appt);
    } catch (err) {
      return next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const paramsParsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!paramsParsed.success) return next(paramsParsed.error);
      const bodyParsed = updateAppointmentStatusSchema.safeParse(req.body);
      if (!bodyParsed.success) return next(bodyParsed.error);
      const updated = await appointmentsService.updateStatus(
        paramsParsed.data.id,
        bodyParsed.data.status,
      );
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async updateNotes(req: Request, res: Response, next: NextFunction) {
    try {
      const paramsParsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!paramsParsed.success) return next(paramsParsed.error);
      const bodyParsed = updateAppointmentNotesSchema.safeParse(req.body);
      if (!bodyParsed.success) return next(bodyParsed.error);
      const updated = await appointmentsService.updateNotes(
        paramsParsed.data.id,
        bodyParsed.data.notes,
      );
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async createAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createManualAppointmentSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const created = await appointmentsService.createManualAppointment(
        parsed.data,
      );
      return ok(res, created, 201);
    } catch (err) {
      return next(err);
    }
  }

  async rescheduleAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const paramsParsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!paramsParsed.success) return next(paramsParsed.error);
      const bodyParsed = (
        await import("./appointments.schema")
      ).rescheduleAppointmentSchema.safeParse(req.body);
      if (!bodyParsed.success) return next(bodyParsed.error);
      const updated = await appointmentsService.rescheduleAppointment(
        paramsParsed.data.id,
        bodyParsed.data.startsAt,
      );
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async finishAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const paramsParsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!paramsParsed.success) return next(paramsParsed.error);

      const bodyParsed = await finishAppointmentSchema.safeParse(req.body);
      if (!bodyParsed.success) return next(bodyParsed.error);

      const updated = await appointmentsService.finishAppointment(
        paramsParsed.data.id,
        String(req.user?.businessId),
        bodyParsed.data,
      );
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async cancelAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = cancelAppointmentSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const result = await appointmentsService.cancelAppointment(
        String(req.params.id),
        req.user!.businessId!,
        parsed.data,
      );
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }
}

export default new AppointmentsController();
