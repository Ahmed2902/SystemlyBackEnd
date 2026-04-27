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
} from "./appointments.schema";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  validate.validateQuery(listAppointmentsQuerySchema),
  appointmentsController.listAppointments
);
router.post(
  "/",
  typeof requireRole === "function"
    ? requireRole(["BusinessAdmin", "Receptionist"])
    : (_req: any, _res: any, next: any) => next(),
  validate.validateBody(createManualAppointmentSchema),
  appointmentsController.createAppointment
);
router.patch(
  "/:id/reschedule",
  typeof requireRole === "function"
    ? requireRole(["BusinessAdmin", "Receptionist"])
    : (_req: any, _res: any, next: any) => next(),
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(rescheduleAppointmentSchema),
  appointmentsController.rescheduleAppointment
);
router.get(
  "/:id",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  appointmentsController.getAppointment
);
router.patch(
  "/:id/status",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(updateAppointmentStatusSchema),
  appointmentsController.updateStatus
);
router.patch(
  "/:id/notes",
  requireAppointmentOwnerOrAdmin,
  validate.validateParams(appointmentIdParamsSchema),
  validate.validateBody(updateAppointmentNotesSchema),
  appointmentsController.updateNotes
);

export default router;
