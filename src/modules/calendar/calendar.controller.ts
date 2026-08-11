import type { NextFunction, Request, Response } from "express";
import { resolveOperationalBranch } from "../../shared/services/branch-context.service";
import { fail, ok } from "../../shared/utils/response.util";
import calendarQueryService from "./calendar.query.service";

class CalendarController {
  async getWorkspace(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId || !req.user) {
        return fail(res, "Business id missing", 403, "FORBIDDEN");
      }

      const date = typeof req.query.date === "string" ? req.query.date : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return fail(
          res,
          "A valid date in YYYY-MM-DD format is required",
          400,
          "BAD_REQUEST",
        );
      }

      const requestedBranchId =
        typeof req.query.branchId === "string" ? req.query.branchId : undefined;
      const scope = await resolveOperationalBranch(req.user, requestedBranchId);
      return ok(
        res,
        await calendarQueryService.getWorkspace(
          scope.businessId,
          scope.branchId,
          date,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }
}

export default new CalendarController();
