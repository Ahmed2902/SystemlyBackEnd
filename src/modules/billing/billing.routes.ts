import { Router } from "express";
import billingController from "./billing.controller";
import { requireAuth, requireBusinessAccess } from "../../shared/middleware/auth.middleware";

const router = Router();

// Start a 14-day trial for the authenticated user's business
router.post("/trial", requireAuth, requireBusinessAccess, billingController.startTrial);

// Webhook endpoint for Paymob (no auth)
router.post("/webhook", billingController.webhook);

export default router;
