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
  requireAuth,
  requireBusinessAccess,
  validate.validateBody(checkoutBodySchema),
  invoicesController.checkout,
);

// PATCH /invoices/:id/mark-paid
router.patch(
  "/:id/mark-paid",
  requireAuth,
  requireBusinessAccess,
  invoicesController.markPaid,
);

// POST /invoices/:id/refund
router.post(
  "/:id/refund",
  requireAuth,
  requireBusinessAccess,
  invoicesController.refund,
);

// GET /invoices/:id — get invoice details
router.get(
  "/:id",
  requireAuth,
  requireBusinessAccess,
  invoicesController.getInvoice,
);

// GET /invoices/:id/receipt — generate PDF receipt
router.get(
  "/:id/receipt",
  requireAuth,
  requireBusinessAccess,
  invoicesController.receiptPdf,
);

router.post(
  "/collect-payment",
  requireAuth,
  requireBusinessAccess,
  invoicesController.collectPayment,
);

export default router;
