import { Router } from "express";
import customersController from "./customers.controller";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";

const router = Router();

router.get("/", requireAuth, customersController.list);
router.get("/:id", requireAuth, customersController.get);
router.patch(
  "/:id/notes",
  requireAuth,
  requireBusinessAccess,
  customersController.updateNotes
);
router.get("/:id/appointments", requireAuth, customersController.appointments);

export default router;
