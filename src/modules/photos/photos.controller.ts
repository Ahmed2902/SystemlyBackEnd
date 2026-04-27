import type { NextFunction, Request, Response } from "express";
import photosService from "./photos.service";
import { ok, fail } from "../../shared/utils/response.util";

class PhotosController {
  async uploadLogo(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = (req as any).user?.businessId;
      if (!businessId) return fail(res, "Business id missing", 400, "BAD_REQUEST");
      const file = (req as any).file;
      if (!file) return fail(res, "No file uploaded", 400, "BAD_REQUEST");
      const updated = await photosService.uploadLogo(businessId, file);
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async uploadCover(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = (req as any).user?.businessId;
      if (!businessId) return fail(res, "Business id missing", 400, "BAD_REQUEST");
      const file = (req as any).file;
      if (!file) return fail(res, "No file uploaded", 400, "BAD_REQUEST");
      const updated = await photosService.uploadCover(businessId, file);
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async uploadGallery(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = (req as any).user?.businessId;
      if (!businessId) return fail(res, "Business id missing", 400, "BAD_REQUEST");
      const file = (req as any).file;
      if (!file) return fail(res, "No file uploaded", 400, "BAD_REQUEST");
      const photo = await photosService.uploadGallery(businessId, file);
      return ok(res, photo);
    } catch (err) {
      return next(err);
    }
  }

  async deleteGallery(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.id as string;
      if (!id) return fail(res, "Photo id missing", 400, "BAD_REQUEST");
      const result = await photosService.deleteGallery(id);
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }
}

export default new PhotosController();
