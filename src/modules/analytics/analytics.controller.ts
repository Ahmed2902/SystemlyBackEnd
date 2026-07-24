import type { Request, Response, NextFunction } from "express";
import analyticsService, { AnalyticsError } from "./analytics.service";
import { AnalyticsStatsQuerySchema } from "./analytics.schema";

function parsePreset(req: Request) {
  const { preset } = AnalyticsStatsQuerySchema.parse(req.query);
  return preset;
}

function resolveBusinessId(req: Request) {
  const businessId = req.user?.businessId;
  if (!businessId) {
    throw new AnalyticsError(
      "Business id missing",
      400,
      "BUSINESS_ID_MISSING",
    );
  }
  return String(businessId);
}

function handleError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof AnalyticsError) {
    return res
      .status(err.statusCode)
      .json({ error: err.message, code: err.code });
  }
  return next(err);
}

class AnalyticsController {
  async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getDashboardOverview(
        resolveBusinessId(req),
        parsePreset(req),
      );
      res.json(data);
    } catch (err) {
      handleError(err, res, next);
    }
  }

  async getRevenue(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getRevenueAnalytics(
        resolveBusinessId(req),
        parsePreset(req),
      );
      res.json(data);
    } catch (err) {
      handleError(err, res, next);
    }
  }

  async getCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getCustomerAnalytics(
        resolveBusinessId(req),
        parsePreset(req),
      );
      res.json(data);
    } catch (err) {
      handleError(err, res, next);
    }
  }

  async getStaff(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getStaffAnalytics(
        resolveBusinessId(req),
        parsePreset(req),
      );
      res.json(data);
    } catch (err) {
      handleError(err, res, next);
    }
  }

  async getOperations(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getOperationsAnalytics(
        resolveBusinessId(req),
        parsePreset(req),
      );
      res.json(data);
    } catch (err) {
      handleError(err, res, next);
    }
  }

  async getGrowth(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await analyticsService.getGrowthAnalytics(
        resolveBusinessId(req),
        parsePreset(req),
      );
      res.json(data);
    } catch (err) {
      handleError(err, res, next);
    }
  }
}

export default new AnalyticsController();
