import type { NextFunction, Request, Response } from "express";
import websiteSetupService from "./website-setup.service";
import {
  publishWebsiteSetupSchema,
  saveWebsiteSetupSchema,
  slugAvailabilityQuerySchema,
  updateSiteDraftSchema,
  websiteSetupParamsSchema,
} from "./website-setup.schema";
import { fail } from "../../shared/utils/response.util";

class WebsiteSetupController {
  async getSetup(req: Request, res: Response, next: NextFunction) {
    try {
      const parsedParams = websiteSetupParamsSchema.safeParse(req.params);
      if (!parsedParams.success) return next(parsedParams.error);

      const result = await websiteSetupService.getWebsiteSetup(
        parsedParams.data.businessId
      );
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }

  async saveSetup(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerUserId = req.user?.id;
      if (!ownerUserId) {
        return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      }

      const parsedParams = websiteSetupParamsSchema.safeParse(req.params);
      if (!parsedParams.success) return next(parsedParams.error);
      const parsedBody = saveWebsiteSetupSchema.safeParse(req.body);
      if (!parsedBody.success) return next(parsedBody.error);

      const result = await websiteSetupService.saveWebsiteSetup(
        parsedParams.data.businessId,
        ownerUserId,
        parsedBody.data
      );
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }

  async checkSlugAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const parsedParams = websiteSetupParamsSchema.safeParse(req.params);
      if (!parsedParams.success) return next(parsedParams.error);
      const parsedQuery = slugAvailabilityQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) return next(parsedQuery.error);

      const result = await websiteSetupService.checkSlugAvailability(
        parsedParams.data.businessId,
        parsedQuery.data.slug
      );
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }

  async publish(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerUserId = req.user?.id;
      if (!ownerUserId) {
        return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      }

      const parsedParams = websiteSetupParamsSchema.safeParse(req.params);
      if (!parsedParams.success) return next(parsedParams.error);
      const parsedBody = publishWebsiteSetupSchema.safeParse(req.body);
      if (!parsedBody.success) return next(parsedBody.error);

      const result = await websiteSetupService.publishWebsiteSetup(
        parsedParams.data.businessId,
        ownerUserId,
        parsedBody.data
      );
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }

  async updateSiteDraft(req: Request, res: Response, next: NextFunction) {
    try {
      const ownerUserId = req.user?.id;
      if (!ownerUserId) {
        return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
      }

      const parsedParams = websiteSetupParamsSchema.safeParse(req.params);
      if (!parsedParams.success) return next(parsedParams.error);
      const parsedBody = updateSiteDraftSchema.safeParse(req.body);
      if (!parsedBody.success) return next(parsedBody.error);

      const result = await websiteSetupService.updateSiteDraft(
        parsedParams.data.businessId,
        ownerUserId,
        parsedBody.data
      );
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  }
}

export default new WebsiteSetupController();
