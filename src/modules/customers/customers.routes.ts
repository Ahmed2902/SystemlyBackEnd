import { Router } from "express";
import customersController from "./customers.controller";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import {
  listCustomersQuerySchema,
  updateCustomerNotesSchema,
} from "./customers.schema";

const router = Router();

router.get(
  "/",
  requireAuth,
  validate.validateQuery(listCustomersQuerySchema),
  customersController.list
);
router.get("/:id", requireAuth, customersController.get);
router.patch(
  "/:id/notes",
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(updateCustomerNotesSchema),
  customersController.updateNotes
);
router.get("/:id/appointments", requireAuth, customersController.appointments);

export default router;
