import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import calendarController from "./calendar.controller";

const router = Router();

router.use(requireAuth, requireBusinessAccess, requireSubscriptionAccess);
router.get("/workspace", calendarController.getWorkspace);

export default router;
