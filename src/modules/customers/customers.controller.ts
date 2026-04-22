import type { NextFunction, Request, Response } from "express";
import * as customersService from "./customers.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  listCustomersQuerySchema,
  updateCustomerNotesSchema,
} from "./customers.schema";

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId)
      return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const parsed = listCustomersQuerySchema.safeParse(req.query);
    if (!parsed.success) return next(parsed.error);
    const query = parsed.data;
    const data = await customersService.listCustomers(
      businessId,
      query.search,
      query.page ?? 1
    );
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const get = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params?.id);
    const data = await customersService.getCustomerById(id);
    if (!data) return fail(res, "Customer not found", 404, "NOT_FOUND");
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const updateNotes = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params?.id);
    const parsed = updateCustomerNotesSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const updated = await customersService.updateNotes(id, parsed.data.notes);
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
};

export const appointments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const id = String(req.params?.id);
    const data = await customersService.getAppointments(id);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export default { list, get, updateNotes, appointments };
