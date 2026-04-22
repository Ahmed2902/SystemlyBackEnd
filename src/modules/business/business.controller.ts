import type { NextFunction, Request, Response } from "express";
import * as businessService from "./business.service";
import { ok } from "../../shared/utils/response.util";
import {
  updateBusinessSchema,
  publishBusinessSchema,
} from "./business.schema";

export const getPublicBySlug = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const slug = String(req.params?.slug);
    const data = await businessService.getPublicBySlug(slug);
    return ok(res, data);
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
    const parsed = updateBusinessSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const updated = await businessService.updateBusiness(id, parsed.data);
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
};

export const publish = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params?.id);
    const parsed = publishBusinessSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const updated = await businessService.publishBusiness(
      id,
      parsed.data.isActive
    );
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
};

export const stats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params?.id);
    const data = await businessService.getStats(id);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export default { getPublicBySlug, update, publish, stats };
