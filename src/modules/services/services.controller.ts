import type { NextFunction, Request, Response } from "express";
import * as servicesService from "./services.service";
import { ok, fail } from "../../shared/utils/response.util";
import { parseCreateService, parseUpdateService } from "./services.validation";

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId)
      return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const data = await servicesService.listByBusiness(businessId);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId)
      return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const payload = parseCreateService(req.body);
    const created = await servicesService.createService(businessId, payload);
    return ok(res, created);
  } catch (err) {
    return next(err);
  }
};

export const update = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params?.id);
    const payload = parseUpdateService(req.body);
    const updated = await servicesService.updateService(id, payload);
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
};

export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params?.id);
    const result = await servicesService.deleteService(id);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

export default { list, create, update, remove };
