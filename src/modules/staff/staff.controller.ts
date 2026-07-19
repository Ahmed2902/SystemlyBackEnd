import type { NextFunction, Request, Response } from "express";
import staffService from "./staff.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  createStaffSchema,
  updateStaffSchema,
  assignServiceSchema,
  updateServiceStaffSchema,
  replaceAvailabilitySchema,
  overridesSchema,
  createInviteSchema,
  acceptInviteSchema,
} from "./staff.schema";

class StaffController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = (req as any).user?.businessId;
      if (!businessId)
        return fail(res, "Business id missing", 400, "BAD_REQUEST");
      const data = await staffService.listByBusiness(businessId);
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = (req as any).user?.businessId;
      if (!businessId)
        return fail(res, "Business id missing", 400, "BAD_REQUEST");
      const parsed = createStaffSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const created = await staffService.createStaff(businessId, parsed.data);
      return ok(res, created);
    } catch (err) {
      return next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params?.id);
      const parsed = updateStaffSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const updated = await staffService.updateStaff(id, parsed.data);
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params?.id);
      const result = await staffService.deleteStaff(id);
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }

  async assignServices(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = String(req.params?.id);
      const parsed = assignServiceSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const row = await staffService.assignService(staffId, parsed.data);
      return ok(res, row);
    } catch (err) {
      return next(err);
    }
  }

  async updateServiceCommission(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const staffId = String(req.params?.id);
      const serviceId = String(req.params?.serviceId);
      const parsed = updateServiceStaffSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const row = await staffService.updateServiceStaff(
        staffId,
        serviceId,
        parsed.data,
      );
      return ok(res, row);
    } catch (err) {
      return next(err);
    }
  }

  async getServiceStaff(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = String(req.params?.id);
      const serviceId = String(req.params?.serviceId);
      const row = await staffService.getServiceStaff(staffId, serviceId);
      if (!row)
        return fail(res, "Service-staff relation not found", 404, "NOT_FOUND");
      return ok(res, row);
    } catch (err) {
      return next(err);
    }
  }

  async unassignService(req: Request, res: Response, next: NextFunction) {
    try {
      const staffId = String(req.params?.id);
      const serviceId = String(req.params?.serviceId);
      const row = await staffService.unassignService(staffId, serviceId);
      return ok(res, row);
    } catch (err) {
      return next(err);
    }
  }

  async getAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params?.id);
      const data = await staffService.getAvailability(id);
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  }

  async listAvailabilityOverridesForDate(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const id = String(req.params?.id);
      const date = String(req.query?.date ?? "");
      const data = await staffService.listAvailabilityOverridesForDate(
        id,
        date,
      );
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  }

  async replaceAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params?.id);
      const arrayParsed = replaceAvailabilitySchema.safeParse(req.body);
      if (!arrayParsed.success) return next(arrayParsed.error);
      const result = await staffService.replaceAvailability(
        id,
        arrayParsed.data,
      );
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }

  async addOverride(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params?.id);
      const parsed = overridesSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const created = await staffService.addOverride(id, parsed.data);
      return ok(res, created);
    } catch (err) {
      return next(err);
    }
  }

  async deleteOverride(req: Request, res: Response, next: NextFunction) {
    try {
      const overrideId = String(req.params?.overrideId);
      const result = await staffService.deleteOverride(overrideId);
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }

  async createInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = (req as any).user?.businessId;
      if (!businessId)
        return fail(res, "Business id missing", 400, "BAD_REQUEST");
      const parsed = createInviteSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const inviterId = (req as any).user?.id;
      const result = await staffService.createInvite(
        businessId,
        parsed.data.email,
        parsed.data.role,
        inviterId,
        parsed.data.expiresInDays,
      );
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }

  async acceptInvite(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = acceptInviteSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const userId = (req as any).user?.id;
      if (!userId) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      const result = await staffService.acceptInvite(parsed.data.token, userId);
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }

  async getCommission(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = (req as any).user?.businessId;
      if (!businessId)
        return fail(res, "Business id missing", 400, "BAD_REQUEST");

      const id = String(req.params?.id);
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const data = await staffService.getCommission(id, businessId, from, to);
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  }

  // #region Staff Breaks
  async listStaffBreaksForDate(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const businessId = req.user.businessId!;
      const date = req.query.date as string;
      const items = await staffService.listStaffBreaksForDate(businessId, date);
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  async createStaffBreak(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user.businessId!;
      const created = await staffService.createStaffBreak(businessId, req.body);
      res.json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  }

  async removeStaffBreak(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user.businessId!;
      const staffId = String(req.params.staffId!);
      await staffService.removeStaffBreak(businessId, staffId);
      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  }
  // #endregion
}

export default new StaffController();
