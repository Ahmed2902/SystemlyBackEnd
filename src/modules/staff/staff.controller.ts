import type { NextFunction, Request, Response } from "express";
import * as staffService from "./staff.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  createStaffSchema,
  updateStaffSchema,
  replaceAvailabilitySchema,
  overridesSchema,
  createInviteSchema,
  acceptInviteSchema,
} from "./staff.schema";

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId)
      return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const data = await staffService.listByBusiness(businessId);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const create = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId)
      return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const parsed = createStaffSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const created = await staffService.createStaff(businessId, parsed.data);
    return ok(res, created);
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
    const parsed = updateStaffSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const updated = await staffService.updateStaff(id, parsed.data);
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
};

export const remove = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params?.id);
    const result = await staffService.deleteStaff(id);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

export const assignServices = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params?.id); // staff id
    const { serviceId } = req.body;
    const row = await staffService.assignService(id, serviceId);
    return ok(res, row);
  } catch (err) {
    return next(err);
  }
};

export const unassignService = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params?.id);
    const serviceId = String(req.params?.serviceId);
    const row = await staffService.unassignService(id, serviceId);
    return ok(res, row);
  } catch (err) {
    return next(err);
  }
};

export const getAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params?.id);
    const data = await staffService.getAvailability(id);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const replaceAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params?.id);
    const arrayParsed = replaceAvailabilitySchema.safeParse(req.body);
    if (!arrayParsed.success) return next(arrayParsed.error);
    const result = await staffService.replaceAvailability(id, arrayParsed.data);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

export const addOverride = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params?.id);
    const parsed = overridesSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const created = await staffService.addOverride(id, parsed.data);
    return ok(res, created);
  } catch (err) {
    return next(err);
  }
};

export const deleteOverride = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const overrideId = String(req.params?.overrideId);
    const result = await staffService.deleteOverride(overrideId);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

export const createInvite = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId) return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const parsed = createInviteSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const inviterId = (req as any).user?.id;
    const result = await staffService.createInvite(
      businessId,
      parsed.data.email,
      parsed.data.role,
      inviterId,
      parsed.data.expiresInDays
    );
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

export const acceptInvite = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = acceptInviteSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const userId = (req as any).user?.id;
    if (!userId) return fail(res, "Unauthorized", 401, "UNAUTHORIZED");
    const result = await staffService.acceptInvite(parsed.data.token, userId);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

export default {
  list,
  create,
  update,
  remove,
  assignServices,
  unassignService,
  getAvailability,
  replaceAvailability,
  addOverride,
  deleteOverride,
  createInvite,
  acceptInvite,
};
