import type { NextFunction, Request, Response } from "express";
import { fail, ok } from "../../shared/utils/response.util";
import * as photosService from "./photos.service";
import {
  businessMediaKindParamsSchema,
  mediaConfirmSchema,
  mediaPresignSchema,
  photoIdParamsSchema,
} from "./photos.schema";

function businessIdFrom(req: Request, res: Response) {
  const businessId = req.user?.businessId;
  if (businessId) return businessId;
  fail(res, "Business id missing", 403, "BUSINESS_CONTEXT_REQUIRED");
  return null;
}

class PhotosController {
  async presign(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req, res);
      if (!businessId) return;
      const params = businessMediaKindParamsSchema.safeParse(req.params);
      const body = mediaPresignSchema.safeParse(req.body);
      if (!params.success) return next(params.error);
      if (!body.success) return next(body.error);
      return ok(
        res,
        await photosService.createUploadTicket(
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
      const businessId = businessIdFrom(req, res);
      if (!businessId) return;
      const params = businessMediaKindParamsSchema.safeParse(req.params);
      const body = mediaConfirmSchema.safeParse(req.body);
      if (!params.success) return next(params.error);
      if (!body.success) return next(body.error);
      const objectPath = body.data.objectPath ?? body.data.publicId;
      if (!objectPath) return fail(res, "objectPath is required", 400, "BAD_REQUEST");
      return ok(
        res,
        await photosService.confirmUpload({
          businessId,
          kind: params.data.kind,
          objectPath,
        }),
        201,
      );
    } catch (error) {
      return next(error);
    }
  }

  async deleteGallery(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req, res);
      if (!businessId) return;
      const params = photoIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      return ok(
        res,
        await photosService.deleteGallery(businessId, params.data.id),
      );
    } catch (error) {
      return next(error);
    }
  }
}

export default new PhotosController();
