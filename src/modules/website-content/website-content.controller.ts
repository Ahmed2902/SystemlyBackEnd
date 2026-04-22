import type { NextFunction, Request, Response } from "express";
import * as websiteService from "./website-content.service";
import { ok, fail } from "../../shared/utils/response.util";
import { websiteContentSchema } from "./website-content.schema";

export const getOwn = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId)
      return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const data = await websiteService.getByBusinessId(businessId);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const updateOwn = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId)
      return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const parsed = websiteContentSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const updated = await websiteService.upsertByBusinessId(
      businessId,
      parsed.data
    );
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
};

export default { getOwn, updateOwn };
