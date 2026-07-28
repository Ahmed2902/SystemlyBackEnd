import type { NextFunction, Request, Response } from "express";
import customersQueryService from "./customers.query.service";
import customersCommandService from "./customers.command.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  createCustomerSchema,
  customerIdParamsSchema,
  listCustomersQuerySchema,
  updateCustomerNotesSchema,
  updateCustomerSchema,
} from "./customers.schema";

function businessIdFrom(req: Request) {
  return req.user?.businessId ?? null;
}

class CustomersController {
  // #region Queries
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const parsed = listCustomersQuerySchema.safeParse(req.query);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await customersQueryService.listCustomers(businessId, parsed.data),
      );
    } catch (error) {
      return next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const parsed = customerIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const customer = await customersQueryService.getCustomerById(
        parsed.data.id,
        businessId,
      );
      if (!customer) return fail(res, "Customer not found", 404, "NOT_FOUND");
      return ok(res, customer);
    } catch (error) {
      return next(error);
    }
  }

  async workspace(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const parsed = customerIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await customersQueryService.getWorkspace(parsed.data.id, businessId),
      );
    } catch (error) {
      return next(error);
    }
  }

  async appointments(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const parsed = customerIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await customersQueryService.getAppointments(parsed.data.id, businessId),
      );
    } catch (error) {
      return next(error);
    }
  }
  // #endregion

  // #region Commands
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const parsed = createCustomerSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await customersCommandService.createCustomer(businessId, parsed.data),
        201,
      );
    } catch (error) {
      return next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const params = customerIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const body = updateCustomerSchema.safeParse(req.body);
      if (!body.success) return next(body.error);
      return ok(
        res,
        await customersCommandService.updateCustomer(
          params.data.id,
          businessId,
          body.data,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async updateNotes(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = businessIdFrom(req);
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const params = customerIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const body = updateCustomerNotesSchema.safeParse(req.body);
      if (!body.success) return next(body.error);
      return ok(
        res,
        await customersCommandService.updateNotes(
          params.data.id,
          businessId,
          body.data.notes,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }
  // #endregion
}

export default new CustomersController();
