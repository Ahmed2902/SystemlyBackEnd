import type { NextFunction, Request, Response } from "express";
import calendarService from "./calendar.service";
import { fail, ok } from "../../shared/utils/response.util";

class CalendarController {
  async getWorkspace(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
        return fail(res, "Business id missing",