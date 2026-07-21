import { Router } from "express";
import appointmentsController from "./appointments.controller";
import {
  requireAuth,
  requireRole,
  requireBusinessId,
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
  requireBusinessId,
  validate.validateBody(createManualAppointmentSchema),
  appointmentsController.CreateManualAppointment,
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

router.post(
  "/:appointmentId/cancel",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(cancelAppointmentSchema),
  appointmentsController.cancelAppointment,
);

router.post(
  "/:appointmentId/photos/presign",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.presignProgressPhoto,
);
router.post(
  "/:appointmentId/photos/confirm",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.confirmProgressPhoto,
);

router.get(
  "/:appointmentId/photos",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.listAppointmentPhotos,
);

router.delete(
  "/:appointmentId/photos/:photoId",
  requireAppointmentOwnerOrAdmin,
  appointmentsController.deleteAppointmentPhoto,
);
router.delete(
  "/:appointmentId",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.deleteAppointment,
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

//not used,  Collect-payment instead
router.post(
  "/:appointmentId/finish",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(finishAppointmentSchema),
  appointmentsController.finishAppointment,
);

export default router;
