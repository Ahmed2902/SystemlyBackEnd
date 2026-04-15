import type { NextFunction, Request, Response } from "express";
import * as websiteService from "./website-content.service";
import { ok, fail } from "../../shared/utils/response.util";
import { parseWebsiteContent } from "./website-content.validation";

export const getOwn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId) return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const data = await websiteService.getByBusinessId(businessId);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const updateOwn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId) return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const payload = parseWebsiteContent(req.body);
    const updated = await websiteService.upsertByBusinessId(businessId, payload);
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
};

export default { getOwn, updateOwn };
