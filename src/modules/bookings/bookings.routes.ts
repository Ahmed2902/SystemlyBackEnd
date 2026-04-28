import { Router } from "express";
import bookingsController from "./bookings.controller";
import validate from "../../shared/middleware/validate.middleware";
import {
  availabilityQuerySchema,
  bookingTokenParamsSchema,
  createBookingSchema,
} from "./bookings.schema";
import { publicBookingRateLimit } from "../../shared/middleware/rateLimit.middleware";

const router = Router();

router.get(
  "/availability",
  validate.validateQuery(availabilityQuerySchema),
  bookingsController.getAvailability
);
router.post(
  "/",
  publicBookingRateLimit,
  validate.validateBody(createBookingSchema),
  bookingsController.createBooking
);
router.get(
  "/confirm/:token",
  validate.validateParams(bookingTokenParamsSchema),
  bookingsController.confirmBooking
);
router.post(
  "/cancel/:token",
  validate.validateParams(bookingTokenParamsSchema),
  bookingsController.cancelBooking
);

export default router;
