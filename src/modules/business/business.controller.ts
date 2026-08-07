import type { NextFunction, Request, Response } from "express";
import businessService from "./business.service";
import { fail, ok } from "../../shared/utils/response.util";
import {
  createBusinessSchema,
  updateBusinessSchema,
  publishBusinessSchema,
} from "./business.schema";

function requireActor(req: Request, res: Response) {
  if (!req.user?.role) {
    fail(res, "Unauthorized", 401, "UNAUTHORIZED");
    return null;
  }
  return {
    businessId: req.user.businessId ?? null,
    role: req.user.role,
  };
}

class BusinessController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      if (!userId) {
        return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      }

      const parsed = createBusinessSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);

      const created = await businessService.createBusinessForUser(
        String(userId),
        typeof userRole === "string" ? userRole : undefined,
        parsed.data,
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
      const actor = requireActor(req, res);
      if (!actor) return;
      const id = String(req.params?.id);
      const parsed = updateBusinessSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const updated = await businessService.updateBusiness(id, actor, parsed.data);
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async publish(req: Request, res: Response, next: NextFunction) {
    try {
      const actor = requireActor(req, res);
      if (!actor) return;
      const id = String(req.params?.id);
      const parsed = publishBusinessSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const updated = await businessService.publishBusiness(
        id,
        actor,
        parsed.data.isActive,
      );
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }
}

export default new BusinessController();
