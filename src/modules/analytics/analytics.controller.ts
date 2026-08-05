import type { NextFunction, Request, Response } from "express";
import { Errors } from "../../shared/errors/application-error";
import { ok } from "../../shared/utils/response.util";
import analyticsService from "./analytics.service";
import { AnalyticsStatsQuerySchema } from "./analytics.schema";

function parsePeriod(req: Request) {
  return AnalyticsStatsQuerySchema.parse(req.query);
}

function resolveBusinessId(req: Request) {
  const businessId = req.user?.businessId;
  if (!businessId) {
    throw Errors.badRequest("Business id missing", "BUSINESS_ID_MISSING");
  }
  return businessId;
}

class AnalyticsController {
  async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await analyticsService.getDashboardOverview(
          resolveBusinessId(req),
          parsePeriod(req),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getRevenue(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await analyticsService.getRevenueAnalytics(
          resolveBusinessId(req),
          parsePeriod(req),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await analyticsService.getCustomerAnalytics(
          resolveBusinessId(req),
          parsePeriod(req),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getStaff(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await analyticsService.getStaffAnalytics(
          resolveBusinessId(req),
          parsePeriod(req),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getOperations(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await analyticsService.getOperationsAnalytics(
          resolveBusinessId(req),
          parsePeriod(req),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getGrowth(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await analyticsService.getGrowthAnalytics(
          resolveBusinessId(req),
          parsePeriod(req),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }
}

export default new AnalyticsController();
