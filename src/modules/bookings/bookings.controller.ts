import type { NextFunction, Request, Response } from "express";
import bookingsService from "./bookings.service";
import { ok, fail } from "../../shared/utils/response.util";
import {
  availabilityQuerySchema,
  bookingTokenParamsSchema,
  createBookingSchema,
} from "./bookings.schema";

class BookingsController {
  async getAvailability(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = availabilityQuerySchema.safeParse(req.query);
      if (!parsed.success)
        return fail(res, "businessId, services and date are required", 400);
      const slots = await bookingsService.getAvailability(parsed.data);
      return ok(res, slots);
    } catch (err) {
      return next(err);
    }
  }

  async createBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = createBookingSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      const result = await bookingsService.createBooking(parsed.data);
      return ok(res, result, 201);
    } catch (err) {
      return next(err);
    }
  }

  async cancelBooking(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = bookingTokenParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const result = await bookingsService.cancelByToken(parsed.data.token);
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }
}

export default new BookingsController();
