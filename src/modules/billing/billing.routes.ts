import { Roles } from "@prisma/client";
import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import billingController from "./billing.controller";
import { subscriptionActionBodySchema } from "./billing.schema";

const router = Router();
const OWNER_ROLES = [Roles.BusinessAdmin, Roles.SuperAdmin];

router.get(
  "/subscription",
  requireAuth,
  requireBusinessAccess,
  requireRole(OWNER_ROLES),
  billingController.getSubscription,
);

router.post(
  "/checkout",
  requireAuth,
  requireBusinessAccess,
  requireRole(OWNER_ROLES),
  validate.validateBody(subscriptionActionBodySchema),
  billingController.createCheckout,
);

// Legacy Paymob webhook remains available until the provider-neutral payment
// ledger and EasyKash adapter replace it in the billing integration PR.
router.post("/webhook", billingController.webhook);

export default router;
