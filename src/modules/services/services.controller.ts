import type { NextFunction, Request, Response } from "express";
import * as servicesService from "./services.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  createServiceSchema,
  updateServiceSchema,
} from "./services.schema";

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
    const parsed = createServiceSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const created = await servicesService.createService(
      businessId,
      parsed.data
    );
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
    const parsed = updateServiceSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const updated = await servicesService.updateService(id, parsed.data);
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
