import { Roles } from "@prisma/client";
import { Router } from "express";
import {
  requireAuth,
  requireBusinessId,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import validate from "../../shared/middleware/validate.middleware";
import branchesController from "./branches.controller";
import {
  branchIdParamsSchema,
  setupBranchSchema,
  updateBranchSchema,
} from "./branches.schema";

const router = Router();
const OWNERS = [Roles.BusinessAdmin, Roles.SuperAdmin];

router.use(requireAuth, requireBusinessId, requireRole(OWNERS));

router.get("/", branchesController.list);
router.post(
  "/setup",
  requireSubscriptionAccess,
  validate.validateBody(setupBranchSchema),
  branchesController.setup,
);
router.get(
  "/:branchId",
  validate.validateParams(branchIdParamsSchema),
  branchesController.get,
);
router.patch(
  "/:branchId",
  requireSubscriptionAccess,
  validate.validateParams(branchIdParamsSchema),
  validate.validateBody(updateBranchSchema),
  branchesController.update,
);
router.post(
  "/:branchId/deactivate",
  requireSubscriptionAccess,
  validate.validateParams(branchIdParamsSchema),
  branchesController.deactivate,
);
router.post(
  "/:branchId/reactivate",
  requireSubscriptionAccess,
  validate.validateParams(branchIdParamsSchema),
  branchesController.reactivate,
);

export default router;
