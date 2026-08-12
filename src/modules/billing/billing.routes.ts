import { Roles } from "@prisma/client";
import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
  requireRole,
} from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import billingController from "./billing.controller";
import {
  billingPaymentParamsSchema,
  billingPaymentsQuerySchema,
  pilotExtensionBodySchema,
  subscriptionActionBodySchema,
} from "./billing.schema";

const router = Router();
const OWNER_ROLES = [Roles.BusinessAdmin, Roles.SuperAdmin];

router.post(
  "/admin/pilot-extension",
  requireAuth,
  requireRole([Roles.SuperAdmin]),
  validate.validateBody(pilotExtensionBodySchema),
  billingController.extendPilotTrial,
);

router.use(requireAuth, requireBusinessAccess, requireRole(OWNER_ROLES));

router.get("/subscription", billingController.getSubscription);
router.get("/plans", billingController.listPlans);
router.get("/pricing", billingController.getPricing);
router.get(
  "/payments",
  validate.validateQuery(billingPaymentsQuerySchema),
  billingController.listPayments,
);
router.get(
  "/payments/:paymentId",
  validate.validateParams(billingPaymentParamsSchema),
  billingController.getPayment,
);
router.post(
  "/checkout",
  validate.validateBody(subscriptionActionBodySchema),
  billingController.createCheckout,
);
router.post("/cancel", billingController.cancel);
router.post("/resume", billingController.resume);

export default router;