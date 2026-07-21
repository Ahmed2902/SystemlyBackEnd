import type { NextFunction, Request, Response } from "express";
import calendarService from "./calendar.service";
import { fail, ok } from "../../shared/utils/response.util";

class CalendarController {
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

      const workspace = await calendarService.getWorkspace(businessId, date);
      return ok(res, workspace);
    } catch (error) {
      return next(error);
    }
  }
}

export default new CalendarController();
