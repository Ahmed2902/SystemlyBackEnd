import type { NextFunction, Request, Response } from "express";
import { fail, ok } from "../../shared/utils/response.util";
import settingsService from "./settings.service";
import {
  brandingConfirmSchema,
  brandingKindParamsSchema,
  brandingPresignSchema,
  publishSettingsSchema,
  updateBusinessSettingsSchema,
  updateWebsiteSettingsSchema,
} from "./settings.schema";

const businessIdFrom = (req: Request) => req.user?.businessId ?? null;

class SettingsController {
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      return ok(res, await settingsService.getWorkspace(businessId));
    } catch (error) {
      return next(error);
    }
  }

  async updateBusiness(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const parsed = updateBusinessSettingsSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(res, await settingsService.updateBusiness(businessId, parsed.data));
    } catch (error) {
      return next(error);
    }
  }

  async updateWebsite(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const parsed = updateWebsiteSettingsSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(res, await settingsService.updateWebsite(businessId, parsed.data));
    } catch (error) {
      return next(error);
    }
  }

  async publish(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const parsed = publishSettingsSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(res, await settingsService.publish(businessId, parsed.data.isActive));
    } catch (error) {
      return next(error);
    }
  }

  async presign(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const params = brandingKindParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const body = brandingPresignSchema.safeParse(req.body);
      if (!body.success) return next(body.error);
      return ok(
        res,
        await settingsService.createBrandingUploadTicket(
          businessId,
          params.data.kind,
          body.data.contentType,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async confirm(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const params = brandingKindParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const body = brandingConfirmSchema.safeParse(req.body);
      if (!body.success) return next(body.error);
      return ok(
        res,
        await settingsService.confirmBranding(
          businessId,
          params.data.kind,
          body.data.publicId,
          body.data.publicUrl,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const params = brandingKindParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      return ok(res, await settingsService.removeBranding(businessId, params.data.kind));
    } catch (error) {
      return next(error);
    }
  }
}

export default new SettingsController();
