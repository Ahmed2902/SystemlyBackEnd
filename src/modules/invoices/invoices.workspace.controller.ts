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

const RECEIPT_WIDTH = 226.77;
const RECEIPT_MARGIN = 18;
const CONTENT_WIDTH = RECEIPT_WIDTH - RECEIPT_MARGIN * 2;

function receiptHeight(invoice: Awaited<ReturnType<typeof invoicesQueryService.get>>) {
  const itemLines = invoice.lineItems.reduce((total, item) => {
    const descriptionLines = Math.max(1, Math.ceil(item.description.length / 28));
    return total + descriptionLines;
  }, 0);
  const optionalRows =
    Number(invoice.discountCents > 0) +
    Number(invoice.taxCents > 0) +
    Number(Boolean(invoice.paymentReference)) +
    Number(Boolean(invoice.notes));
  return Math.max(470, 370 + itemLines * 18 + optionalRows * 20);
}

function separator(doc: any, y: number) {
  doc
    .save()
    .lineWidth(0.7)
    .dash(2, { space: 3 })
    .strokeColor("#374151")
    .moveTo(RECEIPT_MARGIN, y)
    .lineTo(RECEIPT_WIDTH - RECEIPT_MARGIN, y)
    .stroke()
    .undash()
    .restore();
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "EGP",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(value: Date, timezone: string, withTime = false) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone || "Africa/Cairo",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime
      ? { hour: "2-digit", minute: "2-digit", hour12: true }
      : {}),
  }).format(value);
}

function paymentMethodLabel(method: unknown) {
  const value = String(method ?? "Not recorded").replace(/_/g, " ");
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

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
      const doc = new PDFDocument({
        size: [RECEIPT_WIDTH, receiptHeight(invoice)],
        margin: RECEIPT_MARGIN,
        autoFirstPage: true,
        info: {
          Title: `Payment receipt ${invoice.invoiceNumber}`,
          Author: invoice.business.name,
        },
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="receipt-${invoice.invoiceNumber}.pdf"`,
      );
      doc.pipe(res);

      const timezone = invoice.business.timezone || "Africa/Cairo";
      const currency = invoice.currency || "EGP";
      let y = RECEIPT_MARGIN;

      doc
        .fillColor("#111827")
        .font("Helvetica-Bold")
        .fontSize(16)
        .text(invoice.business.name, RECEIPT_MARGIN, y, {
          width: CONTENT_WIDTH,
          align: "center",
        });
      y = doc.y + 5;

      doc.font("Helvetica").fontSize(8.5).fillColor("#4b5563");
      const businessAddress = [invoice.business.address, invoice.business.city]
        .filter(Boolean)
        .join(", ");
      if (businessAddress) {
        doc.text(businessAddress, RECEIPT_MARGIN, y, {
          width: CONTENT_WIDTH,
          align: "center",
        });
        y = doc.y + 2;
      }
      if (invoice.business.phone) {
        doc.text(`Tel. ${invoice.business.phone}`, RECEIPT_MARGIN, y, {
          width: CONTENT_WIDTH,
          align: "center",
        });
        y = doc.y + 8;
      } else {
        y += 6;
      }

      separator(doc, y);
      y += 11;
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("#111827")
        .text("PAYMENT RECEIPT", RECEIPT_MARGIN, y, {
          width: CONTENT_WIDTH,
          align: "center",
          characterSpacing: 1.2,
        });
      y = doc.y + 10;
      separator(doc, y);
      y += 10;

      doc.font("Helvetica").fontSize(8.5).fillColor("#374151");
      const metadata = [
        [`Receipt`, invoice.invoiceNumber],
        [`Issued`, formatDate(invoice.issuedAt, timezone)],
        ...(invoice.paidAt
          ? [[`Paid`, formatDate(invoice.paidAt, timezone, true)]]
          : []),
        [`Customer`, invoice.customer.name],
        ...(invoice.customer.phone ? [[`Phone`, invoice.customer.phone]] : []),
      ];

      for (const [label, value] of metadata) {
        doc.font("Helvetica-Bold").text(`${label}:`, RECEIPT_MARGIN, y, {
          continued: true,
        });
        doc.font("Helvetica").text(` ${value}`, {
          width: CONTENT_WIDTH,
        });
        y = doc.y + 2;
      }

      y += 6;
      separator(doc, y);
      y += 10;

      const itemColumn = RECEIPT_MARGIN;
      const quantityColumn = RECEIPT_WIDTH - RECEIPT_MARGIN - 58;
      const priceColumn = RECEIPT_WIDTH - RECEIPT_MARGIN - 43;

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111827");
      doc.text("Items", itemColumn, y, { width: 115 });
      doc.text("Qty", quantityColumn, y, { width: 22, align: "center" });
      doc.text("Price", priceColumn, y, { width: 43, align: "right" });
      y += 15;
      separator(doc, y);
      y += 8;

      doc.font("Helvetica").fontSize(8.5).fillColor("#1f2937");
      for (const item of invoice.lineItems) {
        const rowY = y;
        doc.text(item.description, itemColumn, rowY, {
          width: 112,
          lineGap: 2,
        });
        const descriptionBottom = doc.y;
        doc.text(String(item.quantity), quantityColumn, rowY, {
          width: 22,
          align: "center",
        });
        doc.text(formatMoney(item.totalCents, currency), priceColumn, rowY, {
          width: 43,
          align: "right",
        });
        y = Math.max(descriptionBottom, rowY + 12) + 5;
      }

      separator(doc, y);
      y += 9;

      const totalLabelX = RECEIPT_MARGIN;
      const totalValueX = RECEIPT_WIDTH - RECEIPT_MARGIN - 78;
      const summaryRow = (label: string, value: string, bold = false) => {
        doc
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(bold ? 10 : 8.5)
          .fillColor("#111827")
          .text(label, totalLabelX, y, { width: 92 });
        doc.text(value, totalValueX, y, { width: 78, align: "right" });
        y += bold ? 17 : 14;
      };

      summaryRow("Subtotal", formatMoney(invoice.subtotalCents, currency));
      if (invoice.discountCents > 0) {
        summaryRow("Discount", `-${formatMoney(invoice.discountCents, currency)}`);
      }
      if (invoice.taxCents > 0) {
        summaryRow("Tax", formatMoney(invoice.taxCents, currency));
      }

      separator(doc, y);
      y += 10;
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor("#111827")
        .text("TOTAL", totalLabelX, y, { width: 80 });
      doc.text(formatMoney(invoice.totalCents, currency), totalValueX - 18, y, {
        width: 96,
        align: "right",
      });
      y += 24;
      separator(doc, y);
      y += 11;

      doc.font("Helvetica").fontSize(8).fillColor("#374151");
      doc.text(
        `Payment method: ${paymentMethodLabel(invoice.paymentMethod)}`,
        RECEIPT_MARGIN,
        y,
        { width: CONTENT_WIDTH, align: "center" },
      );
      y = doc.y + 3;
      if (invoice.paymentReference) {
        doc.text(`Reference: ${invoice.paymentReference}`, RECEIPT_MARGIN, y, {
          width: CONTENT_WIDTH,
          align: "center",
        });
        y = doc.y + 3;
      }
      if (invoice.paidBy?.name) {
        doc.text(`Cashier: ${invoice.paidBy.name}`, RECEIPT_MARGIN, y, {
          width: CONTENT_WIDTH,
          align: "center",
        });
        y = doc.y + 3;
      }

      if (invoice.notes) {
        y += 7;
        separator(doc, y);
        y += 9;
        doc
          .font("Helvetica-Bold")
          .text("Notes", RECEIPT_MARGIN, y, { width: CONTENT_WIDTH });
        y = doc.y + 3;
        doc
          .font("Helvetica")
          .text(invoice.notes, RECEIPT_MARGIN, y, { width: CONTENT_WIDTH });
        y = doc.y + 6;
      }

      y += 7;
      separator(doc, y);
      y += 12;
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#111827")
        .text("THANK YOU", RECEIPT_MARGIN, y, {
          width: CONTENT_WIDTH,
          align: "center",
          characterSpacing: 1,
        });
      y = doc.y + 4;
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor("#4b5563")
        .text("We look forward to serving you again.", RECEIPT_MARGIN, y, {
          width: CONTENT_WIDTH,
          align: "center",
        });

      doc.end();
    } catch (error) {
      return next(error);
    }
  }
}

export default new InvoiceWorkspaceController();
