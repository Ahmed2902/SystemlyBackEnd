import type { NextFunction, Request, Response } from "express";
import { fail, ok } from "../../shared/utils/response.util";
import invoicesQueryService from "./invoices.query.service";
import invoicesCommandService from "./invoices.command.service";
import {
  collectPaymentSchema,
  invoiceIdParamsSchema,
  listInvoicesQuerySchema,
  voidInvoiceSchema,
} from "./invoices.workspace.schema";

class InvoiceWorkspaceController {
  // #region Queries
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const parsed = listInvoicesQuerySchema.safeParse(req.query);
      if (!parsed.success) return next(parsed.error);
      return ok(res, await invoicesQueryService.list(businessId, parsed.data));
    } catch (error) {
      return next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const parsed = invoiceIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      return ok(res, await invoicesQueryService.get(parsed.data.id, businessId));
    } catch (error) {
      return next(error);
    }
  }
  // #endregion

  // #region Commands
  async collect(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      const userId = req.user?.id;
      if (!businessId || !userId) {
        return fail(res, "Business user context missing", 403, "FORBIDDEN");
      }
      const parsed = collectPaymentSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      return ok(
        res,
        await invoicesCommandService.collectPayment(
          businessId,
          userId,
          parsed.data,
        ),
        201,
      );
    } catch (error) {
      return next(error);
    }
  }

  async void(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      const userId = req.user?.id;
      if (!businessId || !userId) {
        return fail(res, "Business user context missing", 403, "FORBIDDEN");
      }
      const params = invoiceIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const body = voidInvoiceSchema.safeParse(req.body);
      if (!body.success) return next(body.error);
      return ok(
        res,
        await invoicesCommandService.voidInvoice(
          params.data.id,
          businessId,
          userId,
          body.data,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }
  // #endregion

  async receipt(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) return fail(res, "Business id missing", 403, "FORBIDDEN");
      const params = invoiceIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const invoice = await invoicesQueryService.get(params.data.id, businessId);

      const PDFDocument = require("pdfkit");
      const doc = new PDFDocument({ margin: 48, size: "A4" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="receipt-${invoice.invoiceNumber}.pdf"`,
      );
      doc.pipe(res);

      if (invoice.business.logoUrl) {
        try {
          const response = await fetch(invoice.business.logoUrl);
          if (response.ok) {
            doc.image(Buffer.from(await response.arrayBuffer()), 48, 42, {
              fit: [72, 54],
            });
          }
        } catch {}
      }

      doc
        .fontSize(19)
        .fillColor("#0f172a")
        .text(invoice.business.name, 132, 48, { align: "right" })
        .fontSize(11)
        .fillColor("#475569")
        .text("Payment Receipt", { align: "right" })
        .moveDown(2);

      doc.fillColor("#0f172a").fontSize(10);
      doc.text(`Receipt: ${invoice.invoiceNumber}`);
      doc.text(`Issued: ${invoice.issuedAt.toLocaleDateString("en-GB")}`);
      if (invoice.paidAt) doc.text(`Paid: ${invoice.paidAt.toLocaleString("en-GB")}`);
      doc.text(`Payment method: ${String(invoice.paymentMethod ?? "").replace(/_/g, " ")}`);
      if (invoice.paymentReference) doc.text(`Reference: ${invoice.paymentReference}`);
      doc.moveDown();
      doc.text(`Customer: ${invoice.customer.name}`);
      if (invoice.customer.phone) doc.text(`Phone: ${invoice.customer.phone}`);
      if (invoice.business.phone) doc.text(`Business phone: ${invoice.business.phone}`);
      if (invoice.business.address || invoice.business.city) {
        doc.text(
          `Business address: ${[invoice.business.address, invoice.business.city]
            .filter(Boolean)
            .join(", ")}`,
        );
      }

      doc.moveDown(1.5).fontSize(12).text("Items").moveDown(0.5);
      doc.fontSize(9).fillColor("#334155");
      for (const item of invoice.lineItems) {
        doc.text(
          `${item.description}   ${item.quantity} x EGP ${(item.unitPriceCents / 100).toFixed(2)}`,
          { continued: true },
        );
        doc.text(`EGP ${(item.totalCents / 100).toFixed(2)}`, { align: "right" });
      }

      doc.moveDown().fillColor("#0f172a");
      doc.text(`Subtotal: EGP ${(invoice.subtotalCents / 100).toFixed(2)}`, {
        align: "right",
      });
      if (invoice.discountCents > 0) {
        doc.text(`Discount: -EGP ${(invoice.discountCents / 100).toFixed(2)}`, {
          align: "right",
        });
      }
      doc.fontSize(14).text(`Total: EGP ${(invoice.totalCents / 100).toFixed(2)}`, {
        align: "right",
      });
      if (invoice.notes) {
        doc.moveDown().fontSize(9).fillColor("#475569").text(`Notes: ${invoice.notes}`);
      }
      doc.end();
    } catch (error) {
      return next(error);
    }
  }
}

export default new InvoiceWorkspaceController();
