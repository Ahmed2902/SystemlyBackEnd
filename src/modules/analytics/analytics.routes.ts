import { Router } from "express";
import analyticsController from "./analytics.controller";
import validate from "../../shared/middleware/validate.middleware";
import { AnalyticsStatsQuerySchema } from "./analytics.schema";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";

const router = Router();

router.get(
  "/dashboard",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(AnalyticsStatsQuerySchema),
  analyticsController.getOverview,
);
router.get(
  "/revenue",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(AnalyticsStatsQuerySchema),
  analyticsController.getRevenue,
);
router.get(
  "/customers",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(AnalyticsStatsQuerySchema),
  analyticsController.getCustomers,
);
router.get(
  "/staff",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(AnalyticsStatsQuerySchema),
  analyticsController.getStaff,
);
router.get(
  "/operations",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(AnalyticsStatsQuerySchema),
  analyticsController.getOperations,
);
router.get(
  "/growth",
  requireAuth,
  requireBusinessAccess,
  validate.validateQuery(AnalyticsStatsQuerySchema),
  analyticsController.getGrowth,
);
// router.get(
//   "/businesses/:businessId/stats",
//   requireAuth,
//   requireBusinessAccess,
//   validate.validateQuery(AnalyticsStatsQuerySchema),
//   analyticsController,
// );

export default router;
