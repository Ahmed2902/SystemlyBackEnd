import type { NextFunction, Request, Response } from "express";
import { fail, ok } from "../../shared/utils/response.util";
import { prisma } from "../../shared/db/prisma";
import invoicesQueryService from "./invoices.query.service";
import invoicesCommandService from "./invoices.command.service";
import { prisma } from "../../shared/db/prisma";
import { createReceiptDocument } from "./receipt-pdf";
import { createReceiptDocument } from "./receipt-pdf";
import {
  collectPaymentSchema,
  invoiceIdParamsSchema,
  listInvoicesQuerySchema,
  receiptLocaleQuerySchema,
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
      const userId = req.user?.id;
      if (!businessId || !userId) {
        return fail(res, "Business user context missing", 403, "FORBIDDEN");
      }

      const params = invoiceIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const query = receiptLocaleQuerySchema.safeParse(req.query);
      if (!query.success) return next(query.error);

      const [invoice, user] = await Promise.all([
        invoicesQueryService.get(params.data.id, businessId),
        prisma.businessUser.findUnique({
          where: { id: userId },
          select: { preferredLanguage: true },
        }),
      ]);
      const locale =
        query.data.locale ?? (user?.preferredLanguage === "ar" ? "ar" : "en");
      const doc = createReceiptDocument(invoice, locale);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="receipt-${invoice.invoiceNumber}-${locale}.pdf"`,
      );
      doc.pipe(res);
      doc.end();
    } catch (error) {
      return next(error);
    }
  }
}

export default new InvoiceWorkspaceController();
