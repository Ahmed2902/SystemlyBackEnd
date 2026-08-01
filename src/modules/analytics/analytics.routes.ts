import { Roles } from "@prisma/client";
import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import validate from "../../shared/middleware/validate.middleware";
import analyticsController from "./analytics.controller";
import { AnalyticsStatsQuerySchema } from "./analytics.schema";

const router = Router();
const ownerOnly = requireRole(Roles.BusinessAdmin);
const middleware = [
  requireAuth,
  requireBusinessAccess,
  ownerOnly,
  requireSubscriptionAccess,
  validate.validateQuery(AnalyticsStatsQuerySchema),
] as const;

router.get("/dashboard", ...middleware, analyticsController.getOverview);
router.get("/revenue", ...middleware, analyticsController.getRevenue);
router.get("/customers", ...middleware, analyticsController.getCustomers);
router.get("/staff", ...middleware, analyticsController.getStaff);
router.get("/operations", ...middleware, analyticsController.getOperations);
router.get("/growth", ...middleware, analyticsController.getGrowth);

export default router;
