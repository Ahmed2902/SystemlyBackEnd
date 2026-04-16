import { Router } from "express";
import * as controller from "./bookings.controller";

const router = Router();

router.get("/availability", controller.getAvailability);
router.post("/", controller.createBooking);
router.get("/confirm/:token", controller.confirmBooking);
router.post("/cancel/:token", controller.cancelBooking);

export default router;
