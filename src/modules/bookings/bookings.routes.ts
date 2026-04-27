import { Router } from "express";
import * as controller from "./bookings.controller";
import validate from "../../shared/middleware/validate.middleware";
import { publicBookingRateLimit } from "../../shared/middleware/rateLimit.middleware";
import {
  availabilityQuerySchema,
  bookingTokenParamsSchema,
  createBookingSchema,
} from "./bookings.schema";

const router = Router();

router.get(
  "/availability",
  validate.validateQuery(availabilityQuerySchema),
  controller.getAvailability
);
router.post(
  "/",
  publicBookingRateLimit,
  validate.validateBody(createBookingSchema),
  controller.createBooking
);
router.get(
  "/confirm/:token",
  validate.validateParams(bookingTokenParamsSchema),
  controller.confirmBooking
);
router.post(
  "/cancel/:token",
  validate.validateParams(bookingTokenParamsSchema),
  controller.cancelBooking
);

export default router;
