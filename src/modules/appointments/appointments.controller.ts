import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../shared/db/prisma";
import { resolveOperationalBranch } from "../../shared/services/branch-context.service";
import { fail, ok } from "../../shared/utils/response.util";
import { invalidateAnalyticsCache } from "../analytics/analytics.service";
import appointmentPhotoService from "./appointment-photo.service";
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

function requireBusinessContext(req: Request, res: Response) {
  const businessId = req.user?.businessId;
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

function appointmentAccessError(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code });
}

async function authorizeExistingAppointment(
  req: Request,
  businessId: string,
  appointmentId: string,
) {
  if (!req.user) {
    throw appointmentAccessError("Unauthorized", 401, "UNAUTHORIZED");
  }
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId },
    select: { branchId: true },
  });
  if (!appointment) {
    throw appointmentAccessError("Appointment not found", 404, "NOT_FOUND");
  }
  if (!appointment.branchId) {
    throw appointmentAccessError(
      "Appointment branch context is missing",
      409,
      "BRANCH_CONTEXT_REQUIRED",
    );
  }
  await resolveOperationalBranch(req.user, appointment.branchId);
  return appointment.branchId;
}

async function assertManualSelectionMatchesBranch(
  businessId: string,
  branchId: string,
  serviceIds: string[],
) {
  const uniqueServiceIds = [...new Set(serviceIds)];
  const count = await prisma.service.count({
    where: {
      id: { in: uniqueServiceIds },
      businessId,
      branchId,
      isActive: true,
    },
  });
  if (count !== uniqueServiceIds.length) {
    throw appointmentAccessError(
      "One or more selected services do not belong to this branch",
      400,
      "INVALID_BRANCH_SELECTION",
    );
  }
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
      const query = listAppointmentsQuerySchema.safeParse(req.query);
      if (!query.success) return next(query.error);
      if (!req.user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      return ok(
        res,
        await appointmentsQueryService.listAppointments({
          user: req.user,
          ...query.data,
        }),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const params = appointmentIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId || !req.user) return;
      const appointment = await appointmentsQueryService.getAppointmentById(
        params.data.appointmentId,
        businessId,
        req.user,
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
      const params = appointmentIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      await authorizeExistingAppointment(req, businessId, params.data.appointmentId);
      return ok(
        res,
        await appointmentPhotoService.list(params.data.appointmentId, businessId),
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
      await authorizeExistingAppointment(req, businessId, params.data.appointmentId);
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
      await authorizeExistingAppointment(req, businessId, params.data.appointmentId);
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
      await authorizeExistingAppointment(req, businessId, params.data.appointmentId);
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.updateNotes(
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
      const body = createManualAppointmentSchema.safeParse(req.body);
      if (!body.success) return next(body.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId || !req.user) return;
      const scope = await resolveOperationalBranch(req.user, body.data.branchId);
      await assertManualSelectionMatchesBranch(
        scope.businessId,
        scope.branchId,
        body.data.services.map((service) => service.serviceId),
      );
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
      await authorizeExistingAppointment(req, businessId, params.data.appointmentId);
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
      await authorizeExistingAppointment(req, businessId, params.data.appointmentId);
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
      await authorizeExistingAppointment(req, businessId, params.data.appointmentId);
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
      const params = appointmentIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      await authorizeExistingAppointment(req, businessId, params.data.appointmentId);
      const contentType = req.body?.contentType;
      const photoType = parsePhotoType(req.body?.type);
      if (typeof contentType !== "string" || !contentType) {
        return fail(res, "contentType is required", 400, "BAD_REQUEST");
      }
      if (!photoType) return fail(res, "Invalid photo type", 400, "BAD_REQUEST");
      return ok(
        res,
        await appointmentPhotoService.createUploadTicket({
          appointmentId: params.data.appointmentId,
          businessId,
          contentType,
          type: photoType,
        }),
      );
    } catch (error) {
      return next(error);
    }
  }

  async confirmProgressPhoto(req: Request, res: Response, next: NextFunction) {
    try {
      const params = appointmentIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      await authorizeExistingAppointment(req, businessId, params.data.appointmentId);
      const objectPath = req.body?.objectPath ?? req.body?.publicId;
      const photoType = parsePhotoType(req.body?.type);
      if (typeof objectPath !== "string" || !objectPath) {
        return fail(res, "objectPath is required", 400, "BAD_REQUEST");
      }
      if (!photoType) return fail(res, "Invalid photo type", 400, "BAD_REQUEST");
      return ok(
        res,
        await appointmentPhotoService.confirm({
          appointmentId: params.data.appointmentId,
          businessId,
          objectPath,
          type: photoType,
        }),
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
      const params = appointmentIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      await authorizeExistingAppointment(req, businessId, params.data.appointmentId);
      const appointmentPhotoId = req.params.photoId;
      if (!appointmentPhotoId) {
        return fail(res, "Photo id is required", 400, "BAD_REQUEST");
      }
      return ok(
        res,
        await appointmentPhotoService.delete({
          appointmentId: params.data.appointmentId,
          businessId,
          appointmentPhotoId: String(appointmentPhotoId),
        }),
      );
    } catch (error) {
      return next(error);
    }
  }

  async deleteAppointment(req: Request, res: Response, next: NextFunction) {
    try {
      const params = appointmentIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      await authorizeExistingAppointment(req, businessId, params.data.appointmentId);
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.deleteCancelledAppointment(
          params.data.appointmentId,
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
      await authorizeExistingAppointment(req, businessId, params.data.appointmentId);
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
      const appointmentId = String(req.params.appointmentId);
      await authorizeExistingAppointment(req, businessId, appointmentId);
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.uncancelAppointment(appointmentId, businessId),
      );
    } catch (error) {
      return next(error);
    }
  }

  async markNoShow(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = requireBusinessContext(req, res);
      if (!businessId) return;
      const appointmentId = String(req.params.appointmentId);
      await authorizeExistingAppointment(req, businessId, appointmentId);
      return mutationResponse(
        res,
        businessId,
        appointmentsCommandService.markNoShowManual(appointmentId, businessId),
      );
    } catch (error) {
      return next(error);
    }
  }
}

export default new AppointmentsController();
