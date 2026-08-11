import type { NextFunction, Request, Response } from "express";
import { ok } from "../../shared/utils/response.util";
import businessService from "./business.service";
import {
  createBusinessSchema,
  publishBusinessSchema,
  updateBusinessSchema,
} from "./business.schema";

class BusinessController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createBusinessSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);

      const created = await businessService.createBusinessForUser(
        req.user.id,
        req.user.role,
        parsed.data,
      );
      return ok(res, created, 201);
    } catch (error) {
      return next(error);
    }
  }

  async getAll(_req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, await businessService.getAllBusinesses());
    } catch (error) {
      return next(error);
    }
  }

  async getPublicBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const branchSlug =
        typeof req.query.branch === "string" ? req.query.branch : undefined;
      return ok(
        res,
        await businessService.getPublicBySlug(
          String(req.params.slug),
          branchSlug,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateBusinessSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await businessService.updateBusiness(String(req.params.id), parsed.data),
      );
    } catch (error) {
      return next(error);
    }
  }

  async publish(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = publishBusinessSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await businessService.publishBusiness(
          String(req.params.id),
          parsed.data.isActive,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }
}

export default new BusinessController();
