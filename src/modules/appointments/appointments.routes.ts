import { Router } from "express";
import * as controller from "./appointments.controller";
import {
  requireAuth,
  requireAppointmentOwnerOrAdmin,
  requireRole,
} from "../../shared/middleware/auth.middleware";

const router = Router();

router.use(requireAuth);

router.get("/", controller.listAppointments);
router.post(
  "/",
  requireRole(["BusinessAdmin", "Staff"]),
  controller.createAppointment
);
router.get("/:id", requireAppointmentOwnerOrAdmin, controller.getAppointment);
router.patch(
  "/:id/status",
  requireAppointmentOwnerOrAdmin,
  controller.updateStatus
);
router.patch(
  "/:id/notes",
  requireAppointmentOwnerOrAdmin,
  controller.updateNotes
);

export default router;
