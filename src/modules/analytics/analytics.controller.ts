import type { NextFunction, Request, Response } from "express";
import { ok } from "../../shared/utils/response.util";
import analyticsService from "./analytics.service";
import { analyticsBusinessQuerySchema } from "./analytics.schema";

class AnalyticsController {
  private resolveBusinessId(req: Request) {
    return String(
      req.params?.businessId ??
        req.params?.id ??
        req.user?.businessId ??
        req.query?.businessId ??
        "",
    );
  }

  private parseQuery(req: Request) {
    const parsed = analyticsBusinessQuerySchema.safeParse(req.query);
    if (!parsed.success) throw parsed.error;
    return parsed.data;
  }

  async dashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const query = this.parseQuery(req);
      const businessId = this.resolveBusinessId(req);
      if (!businessId)
        return next(
          Object.assign(new Error("Business id missing"), {
            statusCode: 400,
            code: "BAD_REQUEST",
          }),
        );
      return ok(
        res,
        await analyticsService.getDashboardOverview(businessId, query),
      );
    } catch (err) {
      return next(err);
    }
  }

  async revenue(req: Request, res: Response, next: NextFunction) {
    try {
      const query = this.parseQuery(req);
      const businessId = this.resolveBusinessId(req);
      if (!businessId)
        return next(
          Object.assign(new Error("Business id missing"), {
            statusCode: 400,
            code: "BAD_REQUEST",
          }),
        );
      return ok(
        res,
        await analyticsService.getRevenueAnalytics(businessId, query),
      );
    } catch (err) {
      return next(err);
    }
  }

  async customers(req: Request, res: Response, next: NextFunction) {
    try {
      const query = this.parseQuery(req);
      const businessId = this.resolveBusinessId(req);
      if (!businessId)
        return next(
          Object.assign(new Error("Business id missing"), {
            statusCode: 400,
            code: "BAD_REQUEST",
          }),
        );
      return ok(
        res,
        await analyticsService.getCustomerAnalytics(businessId, query),
      );
    } catch (err) {
      return next(err);
    }
  }

  async staff(req: Request, res: Response, next: NextFunction) {
    try {
      const query = this.parseQuery(req);
      const businessId = this.resolveBusinessId(req);
      if (!businessId)
        return next(
          Object.assign(new Error("Business id missing"), {
            statusCode: 400,
            code: "BAD_REQUEST",
          }),
        );
      return ok(
        res,
        await analyticsService.getStaffAnalytics(businessId, query),
      );
    } catch (err) {
      return next(err);
    }
  }

  async operations(req: Request, res: Response, next: NextFunction) {
    try {
      const query = this.parseQuery(req);
      const businessId = this.resolveBusinessId(req);
      if (!businessId)
        return next(
          Object.assign(new Error("Business id missing"), {
            statusCode: 400,
            code: "BAD_REQUEST",
          }),
        );
      return ok(
        res,
        await analyticsService.getOperationsAnalytics(businessId, query),
      );
    } catch (err) {
      return next(err);
    }
  }

  async growth(req: Request, res: Response, next: NextFunction) {
    try {
      const query = this.parseQuery(req);
      const businessId = this.resolveBusinessId(req);
      if (!businessId)
        return next(
          Object.assign(new Error("Business id missing"), {
            statusCode: 400,
            code: "BAD_REQUEST",
          }),
        );
      return ok(
        res,
        await analyticsService.getGrowthAnalytics(businessId, query),
      );
    } catch (err) {
      return next(err);
    }
  }

  async legacyStats(req: Request, res: Response, next: NextFunction) {
    try {
      const query = this.parseQuery(req);
      const businessId = this.resolveBusinessId(req);
      if (!businessId)
        return next(
          Object.assign(new Error("Business id missing"), {
            statusCode: 400,
            code: "BAD_REQUEST",
          }),
        );
      return ok(res, await analyticsService.getLegacyStats(businessId, query));
    } catch (err) {
      return next(err);
    }
  }
}

export default new AnalyticsController();
