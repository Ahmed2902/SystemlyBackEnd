import type { NextFunction, Request, Response } from "express";
import * as service from "./bookings.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  availabilityQuerySchema,
  bookingTokenParamsSchema,
  createBookingSchema,
} from "./bookings.schema";

export const getAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = availabilityQuerySchema.safeParse(req.query);
    if (!parsed.success)
      return fail(res, "businessId, serviceId and date are required", 400);
    const slots = await service.getAvailability({
      businessId: parsed.data.businessId,
      serviceId: parsed.data.serviceId,
      staffId: parsed.data.staffId,
      date: parsed.data.date,
      timezone: parsed.data.timezone,
    });
    return ok(res, slots);
  } catch (err) {
    return next(err);
  }
};

export const createBooking = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    const result = await service.createBooking(parsed.data);
    return ok(res, result, 201);
  } catch (err) {
    return next(err);
  }
};

export const confirmBooking = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = bookingTokenParamsSchema.safeParse(req.params);
    if (!parsed.success) return next(parsed.error);
    const data = await service.getByCancelToken(parsed.data.token);
    if (!data) return fail(res, "Not found", 404);
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
};

export const cancelBooking = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsed = bookingTokenParamsSchema.safeParse(req.params);
    if (!parsed.success) return next(parsed.error);
    const result = await service.cancelByToken(parsed.data.token);
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
};

export default {
  getAvailability,
  createBooking,
  confirmBooking,
  cancelBooking,
};
