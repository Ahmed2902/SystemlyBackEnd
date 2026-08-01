import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import validate from "../../shared/middleware/validate.middleware";
import websiteController from "./website-content.controller";
import { websiteContentSchema } from "./website-content.schema";

const router = Router();

router.use(requireAuth, requireBusinessAccess, requireSubscriptionAccess);

router.get("/", websiteController.getOwn);
router.patch(
  "/",
  validate.validateBody(websiteContentSchema),
  websiteController.updateOwn,
);

export default router;
