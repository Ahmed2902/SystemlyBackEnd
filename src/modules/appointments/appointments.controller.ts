import type { NextFunction, Request, Response } from "express";
import { fail, ok } from "../../shared/utils/response.util";
import { invalidateAnalyticsCache } from "../analytics/analytics.service";
import appointmentsCommandService from "./appointments.command.service";
import appointmentsQueryService from "./appointments.query.service";
import {
  appointmentIdParamsSchema,
  cancelAppointmentSchema,
  createManualAppointmentSchema,
  finishAppointmentSchema,
  listAppointmentsQuerySchema,
  rescheduleAppointmentSchema,
  revertAppointmentParamsSchema,
  type UpdateAppointmentBody,
  updateAppointmentNotesSchema,
  updateAppointmentStatusSchema,
} from "./appointments.schema";

const PHOTO_TYPES = ["before", "after", "progress"] as const;
type PhotoType = (typeof PHOTO_TYPES)[number];

function businessIdFrom(req: Request) {
  return req.user?.businessId ?? null;
}

function requireBusinessContext(req: Request, res: Response) {
  const businessId = businessIdFrom(req);
  if (businessId) return businessId;

  fail(
    res,
    "No business associated with this account",
    403,
    "BUSINESS_CONTEXT_REQUIRED",
    req.requestId ?? null,
  );
  return null;
}

function parsePhotoType(value: unknown): PhotoType | null {
  const candidate = value ?? "progress";
  return PHOTO_TYPES.includes(candidate as PhotoType)
    ? (candidate as PhotoType)
    : null;
}

async function mutationResponse<T>(
  res: Response,
  businessId: string,
  operation: Promise<T>,
  statusCode = 200,
) {
  const result = await operation;
  await invalidateAnalyticsCache(businessId);
  return ok(res, result, statusCode);
}

class AppointmentsController {
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
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;

      const appointment = await appointmentsQueryService.getAppointmentById(
        parsed.data.appointmentId,
        businessId,
      );
      return appointment
        ? ok(res, appointment)
        : fail(res, "Not found", 404, "NOT_FOUND");
    } catch (error) {
      return next(error);
    }
  }

  async listAppointmentPhotos(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = appointmentIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
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

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const params = appointmentIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.updateAppointment(
          params.data.appointmentId,
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
      const body = updateAppointmentStatusSchema.safeParse(req.body);
      if (!params.success) return next(params.error);
      if (!body.success) return next(body.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.updateStatus(
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
      const body = updateAppointmentNotesSchema.safeParse(req.body);
      if (!params.success) return next(params.error);
      if (!body.success) return next(body.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.updateNotes(
          params.data.appointmentId,
          businessId,
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
      const body = createManualAppointmentSchema.safeParse(req.body);
      if (!body.success) return next(body.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.createManualAppointment(body.data, businessId),
        201,
      );
    } catch (error) {
      return next(error);
    }
  }

  async rescheduleAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const params = appointmentIdParamsSchema.safeParse(req.params);
      const body = rescheduleAppointmentSchema.safeParse(req.body);
      if (!params.success) return next(params.error);
      if (!body.success) return next(body.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.rescheduleAppointment(
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
      const body = finishAppointmentSchema.safeParse(req.body);
      if (!params.success) return next(params.error);
      if (!body.success) return next(body.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.finishAppointment(
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
      const params = appointmentIdParamsSchema.safeParse(req.params);
      const body = cancelAppointmentSchema.safeParse(req.body);
      if (!params.success) return next(params.error);
      if (!body.success) return next(body.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.cancelAppointment(
          params.data.appointmentId,
          businessId,
          body.data,
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
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      const contentType = req.body?.contentType;
      const photoType = parsePhotoType(req.body?.type);
      if (typeof contentType !== "string" || !contentType) {
        return fail(res, "contentType is required", 400, "BAD_REQUEST");
      }
      if (!photoType) return fail(res, "Invalid photo type", 400, "BAD_REQUEST");
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
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      const publicId = req.body?.publicId;
      const photoType = parsePhotoType(req.body?.type);
      if (typeof publicId !== "string" || !publicId) {
        return fail(res, "publicId is required", 400, "BAD_REQUEST");
      }
      if (!photoType) return fail(res, "Invalid photo type", 400, "BAD_REQUEST");
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
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      const photoId = req.params.photoId;
      if (!photoId) return fail(res, "Photo id is required", 400, "BAD_REQUEST");
      return ok(
        res,
        await appointmentsCommandService.deleteAppointmentPhoto(
          parsed.data.appointmentId,
          businessId,
          String(photoId),
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
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.deleteCancelledAppointment(
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
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.revertAppointment(
          params.data.appointmentId,
          businessId,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async uncancel(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.uncancelAppointment(
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
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.markNoShowManual(
          String(req.params.appointmentId),
          businessId,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }
}

export default new AppointmentsController();