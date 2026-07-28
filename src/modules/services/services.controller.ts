import type { NextFunction, Request, Response } from "express";
import servicesQueryService from "./services.query.service";
import servicesCommandService from "./services.command.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  createServiceSchema,
  listServicesQuerySchema,
  updateServiceSchema,
} from "./services.schema";

class ServicesController {
  // #region Queries
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.businessId) {
        return fail(res, "Business id missing", 400, "BAD_REQUEST");
      }

      const parsed = listServicesQuerySchema.safeParse(req.query);
      if (!parsed.success) return next(parsed.error);

      const data = await servicesQueryService.getCatalog(req.user, parsed.data);
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  }
  // #endregion

  // #region Commands
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.businessId) {
        return fail(res, "Business id missing", 400, "BAD_REQUEST");
      }

      const parsed = createServiceSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);

      const created = await servicesCommandService.createService(
        req.user,
        parsed.data,
      );
      return ok(res, created, 201);
    } catch (err) {
      return next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.businessId) {
        return fail(res, "Business id missing", 400, "BAD_REQUEST");
      }

      const id = String(req.params?.id);
      const parsed = updateServiceSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);

      const updated = await servicesCommandService.updateService(
        id,
        req.user,
        parsed.data,
      );
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async archive(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user?.businessId) {
        return fail(res, "Business id missing", 400, "BAD_REQUEST");
      }

      const id = String(req.params?.id);
      const result = await servicesCommandService.archiveService(id, req.user);
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }
  // #endregion
}

export default new ServicesController();
