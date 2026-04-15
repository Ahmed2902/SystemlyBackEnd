import type { NextFunction, Request, Response } from "express";
import * as customersService from "./customers.service";
import { ok, fail } from "../../shared/utils/response.util";
import { parseListQuery, parseUpdateNotes } from "./customers.validation";

export const list = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const businessId = (req as any).user?.businessId;
    if (!businessId) return fail(res, "Business id missing", 400, "BAD_REQUEST");
    const query = parseListQuery(req.query);
    const page = query.page ? parseInt(query.page, 10) : 1;
    const data = await customersService.listCustomers(businessId, query.search, page);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const get = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = await customersService.getCustomerById(id);
    if (!data) return fail(res, "Customer not found", 404, "NOT_FOUND");
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const updateNotes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const payload = parseUpdateNotes(req.body);
    const updated = await customersService.updateNotes(id, payload.notes);
    return ok(res, updated);
  } catch (err) {
    return next(err);
  }
};

export const appointments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const data = await customersService.getAppointments(id);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export default { list, get, updateNotes, appointments };
