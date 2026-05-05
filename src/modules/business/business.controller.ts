import type { NextFunction, Request, Response } from "express";
import businessService from "./business.service";
import { ok } from "../../shared/utils/response.util";
import {
  createBusinessSchema,
  updateBusinessSchema,
  publishBusinessSchema,
} from "./business.schema";

class BusinessController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      const userRole = (req as any).user?.role;
      if (!userId) {
        const err: any = new Error("Unauthorized");
        err.statusCode = 401;
        err.code = "UNAUTHORIZED";
        throw err;
      }

      const parsed = createBusinessSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);

      const created = await businessService.createBusinessForUser(
        String(userId),
        typeof userRole === "string" ? userRole : undefined,
        parsed.data
      );
      return ok(res, created, 201);
    } catch (err) {
      return next(err);
    }
  }

  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await businessService.getAllBusinesses();
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  }
  async getPublicBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const slug = String(req.params?.slug);
      const data = await businessService.getPublicBySlug(slug);
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params?.id);
      const parsed = updateBusinessSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const updated = await businessService.updateBusiness(id, parsed.data);
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async publish(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params?.id);
      const parsed = publishBusinessSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const updated = await businessService.publishBusiness(
        id,
        parsed.data.isActive
      );
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async stats(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params?.id);
      const data = await businessService.getStats(id);
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  }
}

export default new BusinessController();
