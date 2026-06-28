import type { Request, Response, NextFunction } from "express";
import analyticsService, { AnalyticsError } from "./analytics.service";
import { AnalyticsStatsQuerySchema } from "./analytics.schema";

function parsePreset(req: Request) {
  const { preset } = AnalyticsStatsQuerySchema.parse(req.query);
  return preset;
}

function handleError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof AnalyticsError) {
    return res
      .status(err.statusCode)
      .json({ error: err.message, code: err.code });
  }
  return next(err);
}

class analyticsController {
  async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const preset = parsePreset(req);
      const data = await analyticsService.getDashboardOverview(
        String(req.params.businessId),
        preset,
      );
      res.json(data);
    } catch (err) {
      handleError(err, res, next);
    }
  }

  async getRevenue(req: Request, res: Response, next: NextFunction) {
    try {
      const preset = parsePreset(req);
      const data = await analyticsService.getRevenueAnalytics(
        String(req.params.businessId),
        preset,
      );
      res.json(data);
    } catch (err) {
      handleError(err, res, next);
    }
  }

  async getCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const preset = parsePreset(req);
      const data = await analyticsService.getCustomerAnalytics(
        String(req.params.businessId),
        preset,
      );
      res.json(data);
    } catch (err) {
      handleError(err, res, next);
    }
  }

  async getStaff(req: Request, res: Response, next: NextFunction) {
    try {
      const preset = parsePreset(req);
      const data = await analyticsService.getStaffAnalytics(
        String(req.params.businessId),
        preset,
      );
      res.json(data);
    } catch (err) {
      handleError(err, res, next);
    }
  }

  async getOperations(req: Request, res: Response, next: NextFunction) {
    try {
      const preset = parsePreset(req);
      const data = await analyticsService.getOperationsAnalytics(
        String(req.params.businessId),
        preset,
      );
      res.json(data);
    } catch (err) {
      handleError(err, res, next);
    }
  }

  async getGrowth(req: Request, res: Response, next: NextFunction) {
    try {
      const preset = parsePreset(req);
      const data = await analyticsService.getGrowthAnalytics(
        String(req.params.businessId),
        preset,
      );
      res.json(data);
    } catch (err) {
      handleError(err, res, next);
    }
  }
}

const analyticsControllerInstance = new analyticsController();
export default analyticsControllerInstance;
