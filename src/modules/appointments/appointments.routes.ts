import { Router } from "express";
import appointmentsController from "./appointments.controller";
import {
  requireAuth,
  requireRole,
  requireAppointmentOwnerOrAdmin,
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
  revertAppointmentSchema,
  revertAppointmentParamsSchema,
  updateAppointmentSchema,
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
  "/:appointmentId/reschedule",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(rescheduleAppointmentSchema),
  appointmentsController.rescheduleAppointment,
);
router.get(
  "/:appointmentId",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.getAppointment,
);
router.patch(
  "/:appointmentId/status",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(updateAppointmentStatusSchema),
  appointmentsController.updateStatus,
);
router.patch(
  "/:appointmentId/notes",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(updateAppointmentNotesSchema),
  appointmentsController.updateNotes,
);

// route — one addition to your existing appointments router  // i will not use it as i have collect-payment and its suffecient for V1
router.post(
  "/:appointmentId/finish",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(finishAppointmentSchema),
  appointmentsController.finishAppointment,
);

router.post(
  "/:appointmentId/cancel",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(cancelAppointmentSchema),
  appointmentsController.cancelAppointment,
);

router.post(
  "/:appointmentId/revert",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(revertAppointmentParamsSchema),
  validate.validateBody(revertAppointmentSchema),
  appointmentsController.revertAppointment,
);

router.patch(
  "/:appointmentId",
  requireAppointmentOwnerOrAdmin,
  validate.validateBody(updateAppointmentSchema),
  appointmentsController.update,
);

router.post(
  "/:appointmentId/uncancel",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(revertAppointmentParamsSchema),
  appointmentsController.uncancel,
);
router.post(
  "/:appointmentId/mark-no-show",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(revertAppointmentParamsSchema),
  appointmentsController.markNoShow,
);

export default router;
