import type { NextFunction, Request, Response } from "express";
import * as faqsService from "./faqs.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  parseCreateFaq,
  parseUpdateFaq,
  parseReorder,
} from "./faqs.validation";

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId)
      return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const data = await faqsService.listByBusiness(businessId);
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
    const payload = parseCreateFaq(req.body);
    const created = await faqsService.createFaq(businessId, payload);
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
    const payload = parseUpdateFaq(req.body);
    const updated = await faqsService.updateFaq(id, payload);
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
    const deleted = await faqsService.deleteFaq(id);
    return ok(res, deleted);
  } catch (err) {
    return next(err);
  }
};

export const reorder = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const items = parseReorder(req.body);
    const result = await faqsService.reorderFaqs(items as any);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

export default { list, create, update, remove, reorder };
