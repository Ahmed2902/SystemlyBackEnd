import { Roles } from "@prisma/client";
import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
  requireBusinessId,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import validate from "../../shared/middleware/validate.middleware";
import appointmentCustomItemsController from "./appointment-custom-items.controller";
import appointmentsController from "./appointments.controller";
import {
  appointmentIdParamsSchema,
  cancelAppointmentSchema,
  createManualAppointmentSchema,
  finishAppointmentSchema,
  listAppointmentsQuerySchema,
  rescheduleAppointmentSchema,
  revertAppointmentParamsSchema,
  updateAppointmentNotesSchema,
  updateAppointmentSchema,
  updateAppointmentStatusSchema,
} from "./appointments.schema";

const router = Router();
const OPERATIONS_ROLES = [Roles.BusinessAdmin, Roles.Receptionist];

router.use(
  requireAuth,
  requireBusinessAccess,
  requireSubscriptionAccess,
  requireRole(OPERATIONS_ROLES),
);

router.get(
  "/",
  validate.validateQuery(listAppointmentsQuerySchema),
  appointmentsController.listAppointments,
);
router.post(
  "/",
  requireBusinessId,
  validate.validateBody(createManualAppointmentSchema),
  appointmentsController.CreateManualAppointment,
);
router.patch(
  "/:appointmentId/reschedule",
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(rescheduleAppointmentSchema),
  appointmentsController.rescheduleAppointment,
);
router.get(
  "/:appointmentId",
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.getAppointment,
);
router.patch(
  "/:appointmentId/status",
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(updateAppointmentStatusSchema),
  appointmentsController.updateStatus,
);
router.patch(
  "/:appointmentId/notes",
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(updateAppointmentNotesSchema),
  appointmentsController.updateNotes,
);
router.post(
  "/:appointmentId/cancel",
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(cancelAppointmentSchema),
  appointmentsController.cancelAppointment,
);
router.post(
  "/:appointmentId/photos/presign",
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.presignProgressPhoto,
);
router.post(
  "/:appointmentId/photos/confirm",
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.confirmProgressPhoto,
);
router.get(
  "/:appointmentId/photos",
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.listAppointmentPhotos,
);
router.delete(
  "/:appointmentId/photos/:photoId",
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.deleteAppointmentPhoto,
);
router.put(
  "/:appointmentId/custom-items",
  validate.validateParams(appointmentIdParamsSchema),
  appointmentCustomItemsController.replace,
);
router.delete(
  "/:appointmentId",
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.deleteAppointment,
);
router.post(
  "/:appointmentId/revert",
  validate.validateParams(revertAppointmentParamsSchema),
  appointmentsController.revertAppointment,
);
router.patch(
  "/:appointmentId",
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(updateAppointmentSchema),
  appointmentsController.update,
);
router.post(
  "/:appointmentId/uncancel",
  validate.validateParams(revertAppointmentParamsSchema),
  appointmentsController.uncancel,
);
router.post(
  "/:appointmentId/mark-no-show",
  validate.validateParams(revertAppointmentParamsSchema),
  appointmentsController.markNoShow,
);
router.post(
  "/:appointmentId/finish",
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(finishAppointmentSchema),
  appointmentsController.finishAppointment,
);

export default router;