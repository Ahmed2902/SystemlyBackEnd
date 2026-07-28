import type { NextFunction, Request, Response } from "express";
import appointmentsQueryService from "./appointments.query.service";
import appointmentsCommandService from "./appointments.command.service";
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
  type UpdateAppointmentBody,
  rescheduleAppointmentSchema,
} from "./appointments.schema";

const PHOTO_TYPES = ["before", "after", "progress"] as const;
type PhotoType = (typeof PHOTO_TYPES)[number];

function businessIdFrom(req: Request) {
  return req.user?.businessId ?? null;
}

function parsePhotoType(value: unknown): PhotoType | null {
  const candidate = value ?? "progress";
  return PHOTO_TYPES.includes(candidate as PhotoType)
    ? (candidate as PhotoType)
    : null;
}

class AppointmentsController {
  // #region Queries
  async listAppointments(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = listAppointmentsQuerySchema.safeParse(req.query);
      if (!parsed.success) return next(parsed.error);
      if (!req.user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");

      return ok(
        res,
        await appointmentsQueryService.listAppointments({
          user: req.user,
          ...parsed.data,
        }),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);

      const appointment = await appointmentsQueryService.getAppointmentById(
        parsed.data.appointmentId,
      );
      if (!appointment) return fail(res, "Not found", 404, "NOT_FOUND");
      return ok(res, appointment);
    } catch (error) {
      return next(error);
    }
  }

  async listAppointmentPhotos(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const businessId = businessIdFrom(req);
      if (!businessId)
        return fail(res, "Business id missing", 403, "FORBIDDEN");

      return ok(
        res,
        await appointmentsQueryService.listAppointmentPhotos(
          parsed.data.appointmentId,
          businessId,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }
  // #endregion

  // #region Commands
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const appointmentId = req.params.appointmentId;
      const businessId = businessIdFrom(req);
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

      return ok(
        res,
        await appointmentsCommandService.updateAppointment(
          String(appointmentId),
          businessId,
          req.body as UpdateAppointmentBody,
        ),
      );
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
      const businessId = businessIdFrom(req);
      if (!businessId)
        return fail(res, "Business id missing", 403, "FORBIDDEN");

      return ok(
        res,
        await appointmentsCommandService.updateStatus(
          params.data.appointmentId,
          body.data.status,
          businessId,
        ),
      );
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

      return ok(
        res,
        await appointmentsCommandService.updateNotes(
          params.data.appointmentId,
          body.data.notes,
        ),
      );
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
      const businessId = businessIdFrom(req);
      if (!businessId)
        return fail(res, "Business id missing", 403, "FORBIDDEN");

      return ok(
        res,
        await appointmentsCommandService.createManualAppointment(
          parsed.data,
          businessId,
        ),
        201,
      );
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
      const businessId = businessIdFrom(req);
      if (!businessId)
        return fail(res, "Business id missing", 403, "FORBIDDEN");

      return ok(
        res,
        await appointmentsCommandService.rescheduleAppointment(
          params.data.appointmentId,
          businessId,
          body.data.startsAt,
        ),
      );
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
      const businessId = businessIdFrom(req);
      if (!businessId)
        return fail(res, "Business id missing", 403, "FORBIDDEN");

      return ok(
        res,
        await appointmentsCommandService.finishAppointment(
          params.data.appointmentId,
          businessId,
          body.data,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async cancelAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = cancelAppointmentSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const businessId = businessIdFrom(req);
      if (!businessId)
        return fail(res, "Business id missing", 403, "FORBIDDEN");

      return ok(
        res,
        await appointmentsCommandService.cancelAppointment(
          String(req.params.appointmentId),
          businessId,
          parsed.data,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async presignProgressPhoto(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const businessId = businessIdFrom(req);
      if (!businessId)
        return fail(res, "Business id missing", 403, "FORBIDDEN");

      const contentType = req.body?.contentType;
      if (typeof contentType !== "string" || !contentType) {
        return fail(res, "contentType is required", 400, "BAD_REQUEST");
      }
      const photoType = parsePhotoType(req.body?.type);
      if (!photoType)
        return fail(res, "Invalid photo type", 400, "BAD_REQUEST");

      return ok(
        res,
        await appointmentsCommandService.createProgressPhotoUploadTicket(
          parsed.data.appointmentId,
          businessId,
          contentType,
          photoType,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async confirmProgressPhoto(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const businessId = businessIdFrom(req);
      if (!businessId)
        return fail(res, "Business id missing", 403, "FORBIDDEN");

      const publicId = req.body?.publicId;
      if (typeof publicId !== "string" || !publicId) {
        return fail(res, "publicId is required", 400, "BAD_REQUEST");
      }
      const photoType = parsePhotoType(req.body?.type);
      if (!photoType)
        return fail(res, "Invalid photo type", 400, "BAD_REQUEST");

      return ok(
        res,
        await appointmentsCommandService.confirmProgressPhotoUpload(
          parsed.data.appointmentId,
          businessId,
          publicId,
          photoType,
        ),
        201,
      );
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
      const businessId = businessIdFrom(req);
      if (!businessId)
        return fail(res, "Business id missing", 403, "FORBIDDEN");
      if (!req.params.photoId) {
        return fail(res, "Photo id is required", 400, "BAD_REQUEST");
      }

      return ok(
        res,
        await appointmentsCommandService.deleteAppointmentPhoto(
          parsed.data.appointmentId,
          businessId,
          String(req.params.photoId),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async deleteAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const businessId = businessIdFrom(req);
      if (!businessId)
        return fail(res, "Business id missing", 403, "FORBIDDEN");

      return ok(
        res,
        await appointmentsCommandService.deleteCancelledAppointment(
          parsed.data.appointmentId,
          businessId,
        ),
      );
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

      return ok(
        res,
        await appointmentsCommandService.revertAppointment(
          params.data.appointmentId,
          body.data.businessId,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async uncancel(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) {
        return fail(
          res,
          "No business associated with this account",
          403,
          "FORBIDDEN",
        );
      }

      return ok(
        res,
        await appointmentsCommandService.uncancelAppointment(
          String(req.params.appointmentId),
          businessId,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async markNoShow(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) {
        return fail(
          res,
          "No business associated with this account",
          403,
          "FORBIDDEN",
        );
      }

      return ok(
        res,
        await appointmentsCommandService.markNoShowManual(
          String(req.params.appointmentId),
          businessId,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }
  // #endregion
}

export default new AppointmentsController();
