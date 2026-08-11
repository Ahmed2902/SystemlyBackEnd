import type { NextFunction, Request, Response } from "express";
import { Errors } from "../../shared/errors/application-error";
import { requireOwnedBranch } from "../../shared/services/branch-context.service";
import { ok } from "../../shared/utils/response.util";
import analyticsService from "./analytics.service";
import { AnalyticsStatsQuerySchema } from "./analytics.schema";

function resolveBusinessId(req: Request) {
  const businessId = req.user?.businessId;
  if (!businessId) {
    throw Errors.badRequest("Business id missing", "BUSINESS_ID_MISSING");
  }
  return businessId;
}

async function parseAnalyticsRequest(req: Request) {
  const businessId = resolveBusinessId(req);
  const input = AnalyticsStatsQuerySchema.parse(req.query);
  if (input.branchId) {
    await requireOwnedBranch(businessId, input.branchId);
  }
  return { businessId, ...input };
}

class AnalyticsController {
  async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const input = await parseAnalyticsRequest(req);
      return ok(
        res,
        await analyticsService.getDashboardOverview(
          input.businessId,
          input.period,
          input.branchId,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getRevenue(req: Request, res: Response, next: NextFunction) {
    try {
      const input = await parseAnalyticsRequest(req);
      return ok(
        res,
        await analyticsService.getRevenueAnalytics(
          input.businessId,
          input.period,
          input.branchId,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const input = await parseAnalyticsRequest(req);
      return ok(
        res,
        await analyticsService.getCustomerAnalytics(
          input.businessId,
          input.period,
          input.branchId,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getStaff(req: Request, res: Response, next: NextFunction) {
    try {
      const input = await parseAnalyticsRequest(req);
      return ok(
        res,
        await analyticsService.getStaffAnalytics(
          input.businessId,
          input.period,
          input.branchId,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getOperations(req: Request, res: Response, next: NextFunction) {
    try {
      const input = await parseAnalyticsRequest(req);
      return ok(
        res,
        await analyticsService.getOperationsAnalytics(
          input.businessId,
          input.period,
          input.branchId,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async getGrowth(req: Request, res: Response, next: NextFunction) {
    try {
      const input = await parseAnalyticsRequest(req);
      return ok(
        res,
        await analyticsService.getGrowthAnalytics(
          input.businessId,
          input.period,
          input.branchId,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }
}

export default new AnalyticsController();
