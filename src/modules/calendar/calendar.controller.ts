import type { NextFunction, Request, Response } from "express";
import { fail, ok } from "../../shared/utils/response.util";
import calendarQueryService from "./calendar.query.service";

class CalendarController {
  // #region Queries
  async getWorkspace(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
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

      return ok(res, await calendarQueryService.getWorkspace(businessId, date));
    } catch (error) {
      return next(error);
    }
  }
  // #endregion
}

export default new CalendarController();
