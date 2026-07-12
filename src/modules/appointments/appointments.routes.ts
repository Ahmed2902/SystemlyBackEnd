import { Router } from "express";
import appointmentsController from "./appointments.controller";
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
  finishAppointmentSchema,
  cancelAppointmentSchema,
} from "./appointments.schema";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  validate.validateQuery(listAppointmentsQuerySchema),
  appointmentsController.listAppointments,
);
router.post(
  "/",
  requireRole(["BusinessAdmin", "Receptionist"]),
  validate.validateBody(createManualAppointmentSchema),
  appointmentsController.createAppointment,
);
router.patch(
  "/:id/reschedule",
  requireRole(["BusinessAdmin", "Receptionist"]),
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(rescheduleAppointmentSchema),
  appointmentsController.rescheduleAppointment,
);
router.get(
  "/:id",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.getAppointment,
);
router.patch(
  "/:id/status",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(updateAppointmentStatusSchema),
  appointmentsController.updateStatus,
);
router.patch(
  "/:id/notes",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(updateAppointmentNotesSchema),
  appointmentsController.updateNotes,
);

// route — one addition to your existing appointments router
router.post(
  "/:id/finish",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(finishAppointmentSchema),
  appointmentsController.finishAppointment,
);

router.post(
  "/:id/cancel",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(cancelAppointmentSchema),
  appointmentsController.cancelAppointment,
);

export default router;
