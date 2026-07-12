import { Router } from "express";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import { completeOnboarding } from "./onboarding.controller";

const router = Router();

router.post("/complete", requireAuth, completeOnboarding);

export default router;
