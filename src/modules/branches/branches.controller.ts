import type { NextFunction, Request, Response } from "express";
import { ok } from "../../shared/utils/response.util";
import branchesService from "./branches.service";

class BranchesController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await branchesService.list(
          req.user.businessId!,
          req.query.includeInactive === "true",
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await branchesService.get(
          req.user.businessId!,
          String(req.params.branchId),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await branchesService.create(req.user.businessId!, req.body),
        201,
      );
    } catch (error) {
      return next(error);
    }
  }

  async setup(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await branchesService.setup(req.user.businessId!, req.body),
        201,
      );
    } catch (error) {
      return next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await branchesService.update(
          req.user.businessId!,
          String(req.params.branchId),
          req.body,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async deactivate(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await branchesService.deactivate(
          req.user.businessId!,
          String(req.params.branchId),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async reactivate(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(
        res,
        await branchesService.reactivate(
          req.user.businessId!,
          String(req.params.branchId),
        ),
      );
    } catch (error) {
      return next(error);
    }
  }
}

export default new BranchesController();
