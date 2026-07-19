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
  revertAppointmentSchema,
  revertAppointmentParamsSchema,
  UpdateAppointmentBody,
  rescheduleAppointmentSchema,
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
      const appt = await appointmentsService.getAppointmentById(
        parsed.data.appointmentId,
      );
      if (!appt) return fail(res, "Not found", 404);
      return ok(res, appt);
    } catch (err) {
      return next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { appointmentId } = req.params;
      const businessId = req.user.businessId;

      if (!appointmentId) {
        const err: any = new Error("Appointment id is required");
        err.statusCode = 400;
        err.code = "BAD_REQUEST";
        throw err;
      }
      if (!businessId) {
        const err: any = new Error("No business associated with this account");
        err.statusCode = 403;
        err.code = "FORBIDDEN";
        throw err;
      }

      const updated = await appointmentsService.updateAppointment(
        String(appointmentId),
        businessId,
        req.body as UpdateAppointmentBody,
      );

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const paramsParsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!paramsParsed.success) return next(paramsParsed.error);
      const bodyParsed = updateAppointmentStatusSchema.safeParse(req.body);
      if (!bodyParsed.success) return next(bodyParsed.error);
      const updated = await appointmentsService.updateStatus(
        paramsParsed.data.appointmentId,
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
        paramsParsed.data.appointmentId,
        bodyParsed.data.notes,
      );
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async CreateManualAppointment(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const parsed = createManualAppointmentSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const created = await appointmentsService.createManualAppointment(
        parsed.data,
        req.user!.businessId!,
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
      const bodyParsed = rescheduleAppointmentSchema.safeParse(req.body);
      if (!bodyParsed.success) return next(bodyParsed.error);
      const updated = await appointmentsService.rescheduleAppointment(
        paramsParsed.data.appointmentId,
        req.user!.businessId!,
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
        paramsParsed.data.appointmentId,
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
        String(req.params.appointmentId),
        req.user!.businessId!,
        parsed.data,
      );
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }

  async revertAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      console.log("Revert appointment called with params:", req.params);
      console.log("Revert appointment called with body:", req.body);
      const apptId = revertAppointmentParamsSchema.safeParse(req.params);
      if (!apptId.success) return next(apptId.error);
      console.log("Revert appointment called with params 2:", req.params);

      const businessId = revertAppointmentSchema.safeParse(req.body);
      if (!businessId.success) return next(businessId.error);
      console.log("Revert appointment called with body 2:", req.body);
      const result = await appointmentsService.revertAppointment(
        apptId.data.appointmentId,
        businessId.data.businessId,
      );
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }

  async uncancel(req: Request, res: Response, next: NextFunction) {
    try {
      const { appointmentId } = req.params;
      const businessId = req.user.businessId;
      if (!businessId) {
        const err: any = new Error("No business associated with this account");
        err.statusCode = 403;
        err.code = "FORBIDDEN";
        throw err;
      }
      const updated = await appointmentsService.uncancelAppointment(
        String(appointmentId),
        businessId,
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  async markNoShow(req: Request, res: Response, next: NextFunction) {
    try {
      const { appointmentId } = req.params;
      const businessId = req.user.businessId;
      if (!businessId) {
        const err: any = new Error("No business associated with this account");
        err.statusCode = 403;
        err.code = "FORBIDDEN";
        throw err;
      }
      const updated = await appointmentsService.markNoShowManual(
        String(appointmentId),
        businessId,
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
}

export default new AppointmentsController();
