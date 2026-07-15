import type { Request, Response, NextFunction } from "express";
import invoicesService from "./invoices.service";
import { ok, fail } from "../../shared/utils/response.util";

class InvoicesController {
  async checkout(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId)
        return fail(res, "Business id missing", 400, "BAD_REQUEST");

      const { appointmentId } = req.body;
      if (!appointmentId)
        return fail(res, "appointmentId is required", 400, "BAD_REQUEST");

      const invoice = await invoicesService.checkout(appointmentId, businessId);
      return ok(res, { invoice });
    } catch (err) {
      return next(err);
    }
  }

  async markPaid(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId)
        return fail(res, "Business id missing", 400, "BAD_REQUEST");

      const id = req.params.id as string;
      const invoice = await invoicesService.markPaid(id, businessId);
      return ok(res, { invoice });
    } catch (err) {
      return next(err);
    }
  }

  async refund(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId)
        return fail(res, "Business id missing", 400, "BAD_REQUEST");

      const id = req.params.id as string;
      const result = await invoicesService.refund(id, businessId);
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }

  async getInvoice(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId)
        return fail(res, "Business id missing", 400, "BAD_REQUEST");

      const id = req.params.id as string;
      const invoice = await invoicesService.getInvoice(id, businessId);
      return ok(res, { invoice });
    } catch (err) {
      return next(err);
    }
  }

  async receiptPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId)
        return fail(res, "Business id missing", 400, "BAD_REQUEST");

      const id = req.params.id as string;
      const invoice = await invoicesService.getInvoice(id, businessId);

      // Dynamically require pdfkit to avoid import issues
      const PDFDocument = require("pdfkit");

      const doc = new PDFDocument();
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="receipt-${invoice.invoiceNumber}.pdf"`,
      );
      doc.pipe(res);

      // Header
      doc.fontSize(20).text("Hgezli", { align: "center" });
      doc.fontSize(12).text("Receipt", { align: "center" });
      doc.moveDown();

      // Business info
      doc.fontSize(10).text(`Invoice: ${invoice.invoiceNumber}`);
      doc.text(
        `Date: ${invoice.issuedAt.toLocaleDateString("ar-EG", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}`,
      );
      if (invoice.paidAt) {
        doc.text(
          `Paid: ${invoice.paidAt.toLocaleDateString("ar-EG", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}`,
        );
      }
      doc.moveDown();

      // Customer
      doc.text(`Customer: ${invoice.customer.name}`);
      if (invoice.customer.phone) doc.text(`Phone: ${invoice.customer.phone}`);
      doc.moveDown();

      // Line items
      doc.fontSize(12).text("Services", { underline: true });
      doc.fontSize(10);
      doc.text("----------------------------------------");
      invoice.lineItems.forEach((item: any) => {
        const unitPrice = (item.unitPriceCents / 100).toFixed(2);
        doc.text(`${item.description} x${item.quantity}  ${unitPrice} EGP`);
      });
      doc.text("----------------------------------------");
      doc.moveDown();

      // Total
      const total = (invoice.totalCents / 100).toFixed(2);
      doc.fontSize(14).text(`Total: ${total} EGP`, { align: "right" });

      doc.end();
    } catch (err) {
      return next(err);
    }
  }

  async collectPayment(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId)
        return fail(res, "Business id missing", 400, "BAD_REQUEST");

      const { appointmentId, discountCents } = req.body;

      if (!appointmentId)
        return fail(res, "appointmentId is required", 400, "BAD_REQUEST");

      const result = await invoicesService.collectPayment(
        appointmentId,
        businessId,
        discountCents,
      );
      return ok(res, result);
    } catch (err) {
      return next(err);
    }
  }
}

export default new InvoicesController();
