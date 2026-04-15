import type { NextFunction, Request, Response } from "express";
import * as staffService from "./staff.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  parseCreateStaff,
  parseUpdateStaff,
  parseAvailabilityArray,
  parseOverride,
} from "./staff.validation";

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId) return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const data = await staffService.listByBusiness(businessId);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId) return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const payload = parseCreateStaff(req.body);
    const created = await staffService.createStaff(businessId, payload);
    return ok(res, created);
  } catch (err) {
    return next(err);
  }
};

export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const payload = parseUpdateStaff(req.body);
    const updated = await staffService.updateStaff(id, payload);
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
};

export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const result = await staffService.deleteStaff(id);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

export const assignServices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params; // staff id
    const { serviceId } = req.body;
    const row = await staffService.assignService(id, serviceId);
    return ok(res, row);
  } catch (err) {
    return next(err);
  }
};

export const unassignService = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, serviceId } = req.params;
    const row = await staffService.unassignService(id, serviceId);
    return ok(res, row);
  } catch (err) {
    return next(err);
  }
};

export const getAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = await staffService.getAvailability(id);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const replaceAvailability = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const entries = parseAvailabilityArray(req.body);
    const result = await staffService.replaceAvailability(id, entries);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

export const addOverride = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const payload = parseOverride(req.body);
    const created = await staffService.addOverride(id, payload);
    return ok(res, created);
  } catch (err) {
    return next(err);
  }
};

export const deleteOverride = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { overrideId } = req.params;
    const result = await staffService.deleteOverride(overrideId);
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
};
