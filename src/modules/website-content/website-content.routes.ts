import { Router } from "express";
import websiteController from "./website-content.controller";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import { websiteContentSchema } from "./website-content.schema";

const router = Router();

router.get("/", requireAuth, websiteController.getOwn);
router.patch(
  "/",
  requireAuth,
  validate.validateBody(websiteContentSchema),
  websiteController.updateOwn
);

export default router;
