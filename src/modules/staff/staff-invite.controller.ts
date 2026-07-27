import type { NextFunction, Request, Response } from "express";
import { ok, fail } from "../../shared/utils/response.util";
import {
  acceptInviteSchema,
  createInviteSchema,
} from "./staff-invite.schema";
import staffInviteService from "./staff-invite.service";

class StaffInviteController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
        return fail(res, "Business access required", 403, "FORBIDDEN");
      }
      const parsed = createInviteSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(res, await staffInviteService.create(businessId, parsed.data));
    } catch (error) {
      return next(error);
    }
  }

  async accept(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      const parsed = acceptInviteSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(res, await staffInviteService.accept(parsed.data.token, userId));
    } catch (error) {
      return next(error);
    }
  }
}

export default new StaffInviteController();
