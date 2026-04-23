import { Router } from "express";
import staffController from "./staff.controller";
import {
  requireAuth,
  requireBusinessAccess,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import {
  createStaffSchema,
  overridesSchema,
  replaceAvailabilitySchema,
  updateStaffSchema,
  createInviteSchema,
  acceptInviteSchema,
} from "./staff.schema";

const router = Router();

router.get("/", requireAuth, staffController.list);
router.post(
  "/",
  requireAuth,
  validate.validateBody(createStaffSchema),
  staffController.create
);
router.patch(
  "/:id",
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(updateStaffSchema),
  staffController.update
);
router.delete(
  "/:id",
  requireAuth,
  requireBusinessAccess,
  staffController.remove
);

router.post(
  "/:id/services",
  requireAuth,
  requireBusinessAccess,
  staffController.assignServices
);
router.delete(
  "/:id/services/:serviceId",
  requireAuth,
  requireBusinessAccess,
  staffController.unassignService
);

router.get("/:id/availability", requireAuth, staffController.getAvailability);
router.put(
  "/:id/availability",
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(replaceAvailabilitySchema),
  staffController.replaceAvailability
);
router.post(
  "/:id/availability/overrides",
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(overridesSchema),
  staffController.addOverride
);
router.delete(
  "/:id/availability/overrides/:overrideId",
  requireAuth,
  requireBusinessAccess,
  staffController.deleteOverride
);

router.post(
  "/invites",
  requireAuth,
  requireBusinessAccess,
  requireRole(["BusinessAdmin"]),
  validate.validateBody(createInviteSchema),
  staffController.createInvite
);

router.post(
  "/invites/accept",
  requireAuth,
  validate.validateBody(acceptInviteSchema),
  staffController.acceptInvite
);

export default router;
