import { Router } from "express";
import invoicesController from "./invoices.controller";
import {
  requireAuth,
  requireBusinessAccess,
} from "../../shared/middleware/auth.middleware";
import validate from "../../shared/middleware/validate.middleware";
import { checkoutBodySchema } from "./invoices.schema";

const router = Router();

router.use(requireAuth);

// POST /invoices/checkout — create an invoice from an appointment
router.post(
  "/checkout",
  requireBusinessAccess,
  validate.validateBody(checkoutBodySchema),
  invoicesController.checkout,
);

// PATCH /invoices/:id/mark-paid
router.patch(
  "/:id/mark-paid",
  requireBusinessAccess,
  invoicesController.markPaid,
);

// GET /invoices/:id — get invoice details
router.get("/:id", requireBusinessAccess, invoicesController.getInvoice);

// GET /invoices/:id/receipt — generate PDF receipt
router.get(
  "/:id/receipt",
  requireBusinessAccess,
  invoicesController.receiptPdf,
);

export default router;
