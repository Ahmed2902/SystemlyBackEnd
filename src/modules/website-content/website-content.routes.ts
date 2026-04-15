import { Router } from "express";
import websiteController from "./website-content.controller";
import { requireAuth } from "../../shared/middleware/auth.middleware";

const router = Router();

router.get("/", requireAuth, websiteController.getOwn);
router.patch("/", requireAuth, websiteController.updateOwn);

export default router;
