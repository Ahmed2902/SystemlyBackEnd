import { Router } from "express";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import { requireSubscriptionAccess } from "../../shared/middleware/subscription-access.middleware";
import invoiceWorkspaceController from "./invoices.workspace.controller";

const router = Router();

router.use(requireAuth, requireBusinessAccess, requireSubscriptionAccess);

router.get("/", invoiceWorkspaceController.list);
router.post("/collect-payment", invoiceWorkspaceController.collect);
router.get("/:id/receipt", invoiceWorkspaceController.receipt);
router.post("/:id/void", invoiceWorkspaceController.void);
router.get("/:id", invoiceWorkspaceController.get);

export default router;
