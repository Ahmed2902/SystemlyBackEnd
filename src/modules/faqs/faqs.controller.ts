import type { NextFunction, Request, Response } from "express";
import { ok } from "../../shared/utils/response.util";
import faqsService from "./faqs.service";
import {
  createFaqSchema,
  reorderFaqsSchema,
  updateFaqSchema,
} from "./faqs.schema";

class FaqsController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, await faqsService.listByBusiness(req.user.businessId!));
    } catch (error) {
      return next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createFaqSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await faqsService.createFaq(req.user.businessId!, parsed.data),
      );
    } catch (error) {
      return next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = updateFaqSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await faqsService.updateFaq(String(req.params.id), parsed.data),
      );
    } catch (error) {
      return next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      return ok(res, await faqsService.deleteFaq(String(req.params.id)));
    } catch (error) {
      return next(error);
    }
  }

  async reorder(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = reorderFaqsSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(res, await faqsService.reorderFaqs(parsed.data));
    } catch (error) {
      return next(error);
    }
  }
}

export default new FaqsController();
