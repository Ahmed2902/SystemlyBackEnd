import { Router } from "express";
import analyticsController from "./analytics.controller";
import validate from "../../shared/middleware/validate.middleware";
import { analyticsBusinessQuerySchema } from "./analytics.schema";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";

const router = Router();

router.get(
  "/dashboard",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(analyticsBusinessQuerySchema),
  analyticsController.dashboard,
);
router.get(
  "/revenue",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(analyticsBusinessQuerySchema),
  analyticsController.revenue,
);
router.get(
  "/customers",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(analyticsBusinessQuerySchema),
  analyticsController.customers,
);
router.get(
  "/staff",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(analyticsBusinessQuerySchema),
  analyticsController.staff,
);
router.get(
  "/operations",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(analyticsBusinessQuerySchema),
  analyticsController.operations,
);
router.get(
  "/growth",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(analyticsBusinessQuerySchema),
  analyticsController.growth,
);
router.get(
  "/businesses/:businessId/stats",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(analyticsBusinessQuerySchema),
  analyticsController.legacyStats,
);

export default router;
