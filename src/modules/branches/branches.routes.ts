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
  createBranchSchema,
  setupBranchSchema,
  updateBranchSchema,
} from "./branches.schema";

const router = Router();
const OWNERS = [Roles.BusinessAdmin, Roles.SuperAdmin];

router.use(requireAuth, requireBusinessId, requireRole(OWNERS));

router.get("/", branchesController.list.bind(branchesController));
router.post(
  "/setup",
  requireSubscriptionAccess,
  validate.validateBody(setupBranchSchema),
  branchesController.setup.bind(branchesController),
);
router.get(
  "/:branchId",
  validate.validateParams(branchIdParamsSchema),
  branchesController.get.bind(branchesController),
);
router.post(
  "/",
  requireSubscriptionAccess,
  validate.validateBody(createBranchSchema),
  branchesController.create.bind(branchesController),
);
router.patch(
  "/:branchId",
  requireSubscriptionAccess,
  validate.validateParams(branchIdParamsSchema),
  validate.validateBody(updateBranchSchema),
  branchesController.update.bind(branchesController),
);
router.post(
  "/:branchId/deactivate",
  requireSubscriptionAccess,
  validate.validateParams(branchIdParamsSchema),
  branchesController.deactivate.bind(branchesController),
);
router.post(
  "/:branchId/reactivate",
  requireSubscriptionAccess,
  validate.validateParams(branchIdParamsSchema),
  branchesController.reactivate.bind(branchesController),
);

export default router;
