import type { NextFunction, Request, Response } from "express";
import * as faqsService from "./faqs.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  createFaqSchema,
  updateFaqSchema,
  reorderFaqsSchema,
} from "./faqs.schema";

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
    const parsed = createFaqSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const created = await faqsService.createFaq(businessId, parsed.data);
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
    const parsed = updateFaqSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const updated = await faqsService.updateFaq(id, parsed.data);
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
    const parsed = reorderFaqsSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const result = await faqsService.reorderFaqs(parsed.data);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

export default { list, create, update, remove, reorder };
