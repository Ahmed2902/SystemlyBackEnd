import type { NextFunction, Request, Response } from "express";
import faqsService from "./faqs.service";
import { fail, ok } from "../../shared/utils/response.util";
import {
  createFaqSchema,
  updateFaqSchema,
  reorderFaqsSchema,
} from "./faqs.schema";

function businessIdFrom(req: Request, res: Response) {
  const businessId = req.user?.businessId;
  if (businessId) return businessId;
  fail(res, "Business id missing", 403, "BUSINESS_CONTEXT_REQUIRED");
  return null;
}

class FaqsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req, res);
      if (!businessId) return;
      const data = await faqsService.listByBusiness(businessId);
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req, res);
      if (!businessId) return;
      const parsed = createFaqSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const created = await faqsService.createFaq(businessId, parsed.data);
      return ok(res, created);
    } catch (err) {
      return next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req, res);
      if (!businessId) return;
      const id = String(req.params?.id);
      const parsed = updateFaqSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const updated = await faqsService.updateFaq(businessId, id, parsed.data);
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req, res);
      if (!businessId) return;
      const id = String(req.params?.id);
      const deleted = await faqsService.deleteFaq(businessId, id);
      return ok(res, deleted);
    } catch (err) {
      return next(err);
    }
  }

  async reorder(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req, res);
      if (!businessId) return;
      const parsed = reorderFaqsSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const result = await faqsService.reorderFaqs(businessId, parsed.data);
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }
}

export default new FaqsController();
