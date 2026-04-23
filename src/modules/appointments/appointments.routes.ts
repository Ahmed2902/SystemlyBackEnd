import { Router } from "express";
import * as controller from "./appointments.controller";
import {
  requireAuth,
  requireAppointmentOwnerOrAdmin,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import {
  appointmentIdParamsSchema,
  createManualAppointmentSchema,
  listAppointmentsQuerySchema,
  updateAppointmentNotesSchema,
  updateAppointmentStatusSchema,
  rescheduleAppointmentSchema,
} from "./appointments.schema";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  validate.validateQuery(listAppointmentsQuerySchema),
  controller.listAppointments
);
router.post(
  "/",
  requireRole(["BusinessAdmin", "Receptionist"]),
  validate.validateBody(createManualAppointmentSchema),
  controller.createAppointment
);
router.patch(
  "/:id/reschedule",
  requireRole(["BusinessAdmin", "Receptionist"]),
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(rescheduleAppointmentSchema),
  controller.rescheduleAppointment
);
router.get(
  "/:id",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  controller.getAppointment
);
router.patch(
  "/:id/status",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(updateAppointmentStatusSchema),
  controller.updateStatus
);
router.patch(
  "/:id/notes",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(updateAppointmentNotesSchema),
  controller.updateNotes
);

export default router;
