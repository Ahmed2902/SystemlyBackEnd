import type { NextFunction, Request, Response } from "express";
import * as photosService from "./photos.service";
import { ok, fail } from "../../shared/utils/response.util";

export const uploadLogo = async (req: Request, res: Response, next: NextFunction) => {
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
};

export const uploadCover = async (req: Request, res: Response, next: NextFunction) => {
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
};

export const uploadGallery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Placeholder: gallery not implemented yet
    return ok(res, { message: "NOT_IMPLEMENTED", todo: "Add Photo model and persist gallery entries" });
  } catch (err) {
    return next(err);
  }
};

export const deleteGallery = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Placeholder: gallery not implemented yet
    return ok(res, { message: "NOT_IMPLEMENTED", todo: "Delete gallery photo by id after adding Photo model" });
  } catch (err) {
    return next(err);
  }
};

export default { uploadLogo, uploadCover, uploadGallery, deleteGallery };
