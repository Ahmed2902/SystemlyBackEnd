import { Request, Response } from "express";
import * as service from "./bookings.service";
import { ok, fail } from "../../shared/utils/response.util";

export const getAvailability = async (req: Request, res: Response) => {
  try {
    const { businessId, serviceId, staffId, date, timezone } = req.query as any;
    if (!businessId || !serviceId || !date)
      return fail(res, "businessId, serviceId and date are required", 400);
    const slots = await service.getAvailability({
      businessId,
      serviceId,
      staffId,
      date,
      timezone,
    });
    return ok(res, slots);
  } catch (err: any) {
    return fail(res, err.message || "Internal error", err.statusCode || 500);
  }
};

export const createBooking = async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const result = await service.createBooking(payload);
    return ok(res, result, 201);
  } catch (err: any) {
    const code = err.code || "ERROR";
    const status = err.statusCode || 400;
    return fail(res, err.message || "Could not create booking", status, code);
  }
};

export const confirmBooking = async (req: Request, res: Response) => {
  try {
    const token = Array.isArray(req.params.token)
      ? req.params.token[0]
      : req.params.token;
    const data = await service.getByCancelToken(token);
    if (!data) return fail(res, "Not found", 404);
    return ok(res, data);
  } catch (err: any) {
    return fail(res, err.message || "Internal error", err.statusCode || 500);
  }
};

export const cancelBooking = async (req: Request, res: Response) => {
  try {
    const token = Array.isArray(req.params.token)
      ? req.params.token[0]
      : req.params.token;

    const result = await service.cancelByToken(token);
    return ok(res, result);
  } catch (err: any) {
    return fail(
      res,
      err.message || "Could not cancel booking",
      err.statusCode || 400
    );
  }
};

export default {
  getAvailability,
  createBooking,
  confirmBooking,
  cancelBooking,
};
