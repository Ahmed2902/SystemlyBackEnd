import { Router } from "express";
import { requireAuth } from "../../shared/middleware/auth.middleware";
import invoiceWorkspaceController from "./invoices.workspace.controller";

const router = Router();

router.use(requireAuth);

router.get("/", invoiceWorkspaceController.list);
router.post("/collect-payment", invoiceWorkspaceController.collect);
router.get("/:id/receipt", invoiceWorkspaceController.receipt);
router.post("/:id/void", invoiceWorkspaceController.void);
router.get("/:id", invoiceWorkspaceController.get);

export default router;
