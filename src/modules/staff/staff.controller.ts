import type { NextFunction, Request, Response } from "express";
import { fail, ok } from "../../shared/utils/response.util";
import staffCommandService from "./staff.command.service";
import staffQueryService from "./staff.query.service";
import {
  acceptInviteSchema,
  assignServiceSchema,
  createInviteSchema,
  createStaffBreakSchema,
  createStaffSchema,
  createTimeOffSchema,
  overridesSchema,
  replaceAvailabilitySchema,
  staffDirectoryQuerySchema,
  updateServiceStaffSchema,
  updateStaffSchema,
} from "./staff.schema";

class StaffController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = staffDirectoryQuerySchema.safeParse(req.query);
      if (!parsed.success) return next(parsed.error);
      return ok(res, await staffQueryService.listDirectory(req.user, parsed.data));
    } catch (error) {
      return next(error);
    }
  }

  async workspace(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffQueryService.getWorkspace(String(req.params.id), req.user),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getServiceStaff(req: Request, res: Response, next: NextFunction) {
    try {
      const row = await staffQueryService.getServiceStaff(
        String(req.params.id),
        String(req.params.serviceId),
      );
      if (!row) {
        return fail(res, "Service-staff relation not found", 404, "NOT_FOUND");
      }
      return ok(res, row);
    } catch (error) {
      return next(error);
    }
  }

  async getAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, await staffQueryService.getAvailability(String(req.params.id)));
    } catch (error) {
      return next(error);
    }
  }

  async listAvailabilityOverridesForDate(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      return ok(
        res,
        await staffQueryService.listAvailabilityOverridesForDate(
          String(req.params.id),
          String(req.query.date ?? ""),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getCommission(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffQueryService.getCommission(
          String(req.params.id),
          req.user.businessId!,
          req.query.from as string | undefined,
          req.query.to as string | undefined,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async listStaffBreaksForDate(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffQueryService.listStaffBreaksForDate(
          req.user.businessId!,
          String(req.query.date ?? ""),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createStaffSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(res, await staffCommandService.createStaff(req.user, parsed.data), 201);
    } catch (error) {
      return next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateStaffSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffCommandService.updateStaff(
          String(req.params.id),
          req.user,
          parsed.data,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffCommandService.deactivateStaff(String(req.params.id), req.user),
      );
    } catch (error) {
      return next(error);
    }
  }

  async assignServices(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = assignServiceSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffCommandService.assignService(String(req.params.id), parsed.data),
      );
    } catch (error) {
      return next(error);
    }
  }

  async updateServiceCommission(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateServiceStaffSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffCommandService.updateServiceStaff(
          String(req.params.id),
          String(req.params.serviceId),
          parsed.data,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async unassignService(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffCommandService.unassignService(
          String(req.params.id),
          String(req.params.serviceId),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async replaceAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = replaceAvailabilitySchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffCommandService.replaceAvailability(
          String(req.params.id),
          req.user,
          parsed.data,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async addOverride(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = overridesSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffCommandService.addOverride(String(req.params.id), parsed.data),
        201,
      );
    } catch (error) {
      return next(error);
    }
  }

  async deleteOverride(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffCommandService.deleteOverride(String(req.params.overrideId)),
      );
    } catch (error) {
      return next(error);
    }
  }

  async createBreak(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createStaffBreakSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffCommandService.createBreak(
          String(req.params.id),
          req.user,
          parsed.data,
        ),
        201,
      );
    } catch (error) {
      return next(error);
    }
  }

  async deleteBreak(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffCommandService.deleteBreak(
          String(req.params.id),
          String(req.params.breakId),
          req.user,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async createTimeOff(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createTimeOffSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffCommandService.createTimeOff(
          String(req.params.id),
          req.user,
          parsed.data,
        ),
        201,
      );
    } catch (error) {
      return next(error);
    }
  }

  async deleteTimeOff(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffCommandService.deleteTimeOff(
          String(req.params.id),
          String(req.params.timeOffId),
          req.user,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async createInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createInviteSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffCommandService.createInvite(req.user.businessId!, parsed.data),
        201,
      );
    } catch (error) {
      return next(error);
    }
  }

  async acceptInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = acceptInviteSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffCommandService.acceptInvite(parsed.data.token, req.user.id),
      );
    } catch (error) {
      return next(error);
    }
  }

  async presignPhoto(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffCommandService.presignPhoto(
          String(req.params.id),
          req.user.businessId!,
          String(req.body?.contentType ?? ""),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async confirmPhoto(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffCommandService.confirmPhoto(
          String(req.params.id),
          req.user.businessId!,
          String(req.body?.publicId ?? ""),
          String(req.body?.publicUrl ?? ""),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async removePhoto(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffCommandService.removePhoto(
          String(req.params.id),
          req.user.businessId!,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async createStaffBreak(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffCommandService.createStaffBreak(req.user.businessId!, req.body),
        201,
      );
    } catch (error) {
      return next(error);
    }
  }

  async removeStaffBreak(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await staffCommandService.removeStaffBreak(
          req.user.businessId!,
          String(req.params.id),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }
}

export default new StaffController();
