import type { NextFunction, Request, Response } from "express";
import customersService from "./customers.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  listCustomersQuerySchema,
  updateCustomerNotesSchema,
} from "./customers.schema";

class CustomersController {
  async list(req: Request, res: Response, next: NextFunction) {
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
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params?.id);
      const data = await customersService.getCustomerById(id);
      if (!data) return fail(res, "Customer not found", 404, "NOT_FOUND");
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  }

  async updateNotes(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params?.id);
      const parsed = updateCustomerNotesSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const updated = await customersService.updateNotes(id, parsed.data.notes);
      return ok(res, updated);
    } catch (err) {
      return next(err);
    }
  }

  async appointments(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params?.id);
      const data = await customersService.getAppointments(id);
      return ok(res, data);
    } catch (err) {
      return next(err);
    }
  }
}

export default new CustomersController();
