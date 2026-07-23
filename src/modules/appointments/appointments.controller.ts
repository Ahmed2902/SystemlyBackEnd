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
    } catch (error) {
      return next(error);
    }
  }

  async getAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const appointment = await appointmentsService.getAppointmentById(
        parsed.data.appointmentId,
      );
      if (!appointment) return fail(res, "Not found", 404);
      return ok(res, appointment);
    } catch (error) {
      return next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const appointmentId = req.params.appointmentId;
      const businessId = req.user.businessId;
      if (!appointmentId) {
        return fail(res, "Appointment id is required", 400, "BAD_REQUEST");
      }
      if (!businessId) {
        return fail(
          res,
          "No business associated with this account",
          403,
          "FORBIDDEN",
        );
      }
      const updated = await appointmentsService.updateAppointment(
        String(appointmentId),
        businessId,
        req.body as UpdateAppointmentBody,
      );
      return ok(res, updated);
    } catch (error) {
      return next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const params = appointmentIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const body = updateAppointmentStatusSchema.safeParse(req.body);
      if (!body.success) return next(body.error);
      const updated = await appointmentsService.updateStatus(
        params.data.appointmentId,
        body.data.status,
        req.user!.businessId!,
      );
      return ok(res, updated);
    } catch (error) {
      return next(error);
    }
  }

  async updateNotes(req: Request, res: Response, next: NextFunction) {
    try {
      const params = appointmentIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const body = updateAppointmentNotesSchema.safeParse(req.body);
      if (!body.success) return next(body.error);
      const updated = await appointmentsService.updateNotes(
        params.data.appointmentId,
        body.data.notes,
      );
      return ok(res, updated);
    } catch (error) {
      return next(error);
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
    } catch (error) {
      return next(error);
    }
  }

  async rescheduleAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const params = appointmentIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const body = rescheduleAppointmentSchema.safeParse(req.body);
      if (!body.success) return next(body.error);
      const updated = await appointmentsService.rescheduleAppointment(
        params.data.appointmentId,
        req.user!.businessId!,
        body.data.startsAt,
      );
      return ok(res, updated);
    } catch (error) {
      return next(error);
    }
  }

  async finishAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const params = appointmentIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const body = finishAppointmentSchema.safeParse(req.body);
      if (!body.success) return next(body.error);
      const updated = await appointmentsService.finishAppointment(
        params.data.appointmentId,
        String(req.user?.businessId),
        body.data,
      );
      return ok(res, updated);
    } catch (error) {
      return next(error);
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
    } catch (error) {
      return next(error);
    }
  }

  async presignProgressPhoto(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const businessId = req.user?.businessId;
      if (!businessId) {
        return fail(res, "Business id missing", 403, "FORBIDDEN");
      }
      const contentType = req.body?.contentType;
      if (typeof contentType !== "string" || !contentType) {
        return fail(res, "contentType is required", 400, "BAD_REQUEST");
      }
      const rawType = req.body?.type ?? "progress";
      const allowedTypes = ["before", "after", "progress"] as const;
      if (!allowedTypes.includes(rawType)) {
        return fail(res, "Invalid photo type", 400, "BAD_REQUEST");
      }
      const result = await appointmentsService.createProgressPhotoUploadTicket(
        parsed.data.appointmentId,
        businessId,
        contentType,
        rawType,
      );
      return ok(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async confirmProgressPhoto(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const businessId = req.user?.businessId;
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const publicId = req.body?.publicId;
      if (typeof publicId !== "string" || !publicId) {
        return fail(res, "publicId is required", 400, "BAD_REQUEST");
      }
      const rawType = req.body?.type ?? "progress";
      const allowedTypes = ["before", "after", "progress"] as const;
      if (!allowedTypes.includes(rawType)) {
        return fail(res, "Invalid photo type", 400, "BAD_REQUEST");
      }
      const result = await appointmentsService.confirmProgressPhotoUpload(
        parsed.data.appointmentId,
        businessId,
        publicId,
        rawType,
      );
      return ok(res, result, 201);
    } catch (error) {
      return next(error);
    }
  }

  async listAppointmentPhotos(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const businessId = req.user?.businessId;
      if (!businessId) {
        return fail(res, "Business id missing", 403, "FORBIDDEN");
      }
      const photos = await appointmentsService.listAppointmentPhotos(
        parsed.data.appointmentId,
        businessId,
      );
      return ok(res, photos);
    } catch (error) {
      return next(error);
    }
  }

  async deleteAppointmentPhoto(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const businessId = req.user?.businessId;
      if (!businessId) {
        return fail(res, "Business id missing", 403, "FORBIDDEN");
      }
      const photoId = req.params.photoId;
      if (!photoId) {
        return fail(res, "Photo id is required", 400, "BAD_REQUEST");
      }
      const result = await appointmentsService.deleteAppointmentPhoto(
        parsed.data.appointmentId,
        businessId,
        String(photoId),
      );
      return ok(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async deleteAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const businessId = req.user?.businessId;
      if (!businessId) {
        return fail(res, "Business id missing", 403, "FORBIDDEN");
      }
      const result = await appointmentsService.deleteCancelledAppointment(
        parsed.data.appointmentId,
        businessId,
      );
      return ok(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async revertAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const params = revertAppointmentParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const body = revertAppointmentSchema.safeParse(req.body);
      if (!body.success) return next(body.error);
      const result = await appointmentsService.revertAppointment(
        params.data.appointmentId,
        body.data.businessId,
      );
      return ok(res, result);
    } catch (error) {
      return next(error);
    }
  }

  async uncancel(req: Request, res: Response, next: NextFunction) {
    try {
      const appointmentId = String(req.params.appointmentId);
      const businessId = req.user.businessId;
      if (!businessId) {
        return fail(
          res,
          "No business associated with this account",
          403,
          "FORBIDDEN",
        );
      }
      const updated = await appointmentsService.uncancelAppointment(
        appointmentId,
        businessId,
      );
      return ok(res, updated);
    } catch (error) {
      return next(error);
    }
  }

  async markNoShow(req: Request, res: Response, next: NextFunction) {
    try {
      const appointmentId = String(req.params.appointmentId);
      const businessId = req.user.businessId;
      if (!businessId) {
        return fail(
          res,
          "No business associated with this account",
          403,
          "FORBIDDEN",
        );
      }
      const updated = await appointmentsService.markNoShowManual(
        appointmentId,
        businessId,
      );
      return ok(res, updated);
    } catch (error) {
      return next(error);
    }
  }
}

export default new AppointmentsController();
