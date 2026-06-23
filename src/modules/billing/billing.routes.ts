import { Router } from "express";
import billingController from "./billing.controller";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import { subscriptionActionBodySchema } from "./billing.schema";

const router = Router();

// Start a 14-day trial for the authenticated user's business
router.post(
  "/trial",
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(subscriptionActionBodySchema),
  billingController.startTrial,
);

// Create a checkout / payment for subscribing to a plan
router.post(
  "/checkout",
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(subscriptionActionBodySchema),
  billingController.createCheckout,
);

// Webhook endpoint for Paymob (no auth)
// NOTE: raw body capture is done in app.ts (registered before app-wide json parser)
router.post("/webhook", billingController.webhook);

export default router;
