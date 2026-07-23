import type { NextFunction, Request, Response } from "express";
import { fail, ok } from "../../shared/utils/response.util";
import {
  createStaffBreakSchema,
  createStaffSchema,
  createTimeOffSchema,
  replaceAvailabilitySchema,
  staffDirectoryQuerySchema,
  updateStaffSchema,
} from "./staff.schema";
import staffWorkspaceService from "./staff.workspace.service";

class StaffWorkspaceController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      const parsed = staffDirectoryQuerySchema.safeParse(req.query);
      if (!parsed.success) return next(parsed.error);
      return ok(res, await staffWorkspaceService.listDirectory(req.user, parsed.data));
    } catch (error) {
      return next(error);
    }
  }

  async workspace(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      return ok(
        res,
        await staffWorkspaceService.getWorkspace(String(req.params.id), req.user),
      );
    } catch (error) {
      return next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      const parsed = createStaffSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(res, await staffWorkspaceService.createStaff(req.user, parsed.data));
    } catch (error) {
      return next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      const parsed = updateStaffSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffWorkspaceService.updateStaff(
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
      if (!req.user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      return ok(
        res,
        await staffWorkspaceService.deactivateStaff(
          String(req.params.id),
          req.user,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async replaceAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      const parsed = replaceAvailabilitySchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffWorkspaceService.replaceAvailability(
          String(req.params.id),
          req.user,
          parsed.data,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async createBreak(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      const parsed = createStaffBreakSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffWorkspaceService.createBreak(
          String(req.params.id),
          req.user,
          parsed.data,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async deleteBreak(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      return ok(
        res,
        await staffWorkspaceService.deleteBreak(
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
      if (!req.user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      const parsed = createTimeOffSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await staffWorkspaceService.createTimeOff(
          String(req.params.id),
          req.user,
          parsed.data,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async deleteTimeOff(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      return ok(
        res,
        await staffWorkspaceService.deleteTimeOff(
          String(req.params.id),
          String(req.params.timeOffId),
          req.user,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }
}

export default new StaffWorkspaceController();
