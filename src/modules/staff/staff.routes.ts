import { Router } from "express";
import staffController from "./staff.controller";
import { requireAuth, requireBusinessAccess } from "../../shared/middleware/auth.middleware";

const router = Router();

router.get("/", requireAuth, staffController.list);
router.post("/", requireAuth, staffController.create);
router.patch("/:id", requireAuth, requireBusinessAccess, staffController.update);
router.delete("/:id", requireAuth, requireBusinessAccess, staffController.remove);

router.post("/:id/services", requireAuth, requireBusinessAccess, staffController.assignServices);
router.delete(
  "/:id/services/:serviceId",
  requireAuth,
  requireBusinessAccess,
  staffController.unassignService
);

router.get("/:id/availability", requireAuth, staffController.getAvailability);
router.put("/:id/availability", requireAuth, requireBusinessAccess, staffController.replaceAvailability);
router.post("/:id/availability/overrides", requireAuth, requireBusinessAccess, staffController.addOverride);
router.delete(
  "/:id/availability/overrides/:overrideId",
  requireAuth,
  requireBusinessAccess,
  staffController.deleteOverride
);

export default router;
