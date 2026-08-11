import type { NextFunction, Request, Response } from "express";
import { prisma } from "../../shared/db/prisma";
import { resolveOperationalBranch } from "../../shared/services/branch-context.service";
import { fail, ok } from "../../shared/utils/response.util";
import invoicesQueryService from "./invoices.query.service";
import invoicesCommandService from "./invoices.command.service";
import { createReceiptDocument } from "./receipt-pdf";
import {
  collectPaymentSchema,
  invoiceIdParamsSchema,
  listInvoicesQuerySchema,
  voidInvoiceSchema,
} from "./invoices.workspace.schema";

const branchError = (message: string, statusCode: number, code: string) =>
  Object.assign(new Error(message), { statusCode, code });

async function resolveInvoiceBranch(
  req: Request,
  businessId: string,
  invoiceId: string,
) {
  if (!req.user) throw branchError("Unauthorized", 401, "UNAUTHORIZED");
  const branchId = await invoicesQueryService.getBranchId(invoiceId, businessId);
  await resolveOperationalBranch(req.user, branchId);
  return branchId;
}

async function resolveAppointmentBranch(
  req: Request,
  businessId: string,
  appointmentId: string,
) {
  if (!req.user) throw branchError("Unauthorized", 401, "UNAUTHORIZED");
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId },
    select: { branchId: true },
  });
  if (!appointment) {
    throw branchError("Appointment not found", 404, "NOT_FOUND");
  }
  if (!appointment.branchId) {
    throw branchError(
      "Appointment branch context is missing",
      409,
      "BRANCH_CONTEXT_REQUIRED",
    );
  }
  await resolveOperationalBranch(req.user, appointment.branchId);
  return appointment.branchId;
}

class InvoiceWorkspaceController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId || !req.user) {
        return fail(res, "Business id missing", 403, "FORBIDDEN");
      }
      const parsed = listInvoicesQuerySchema.safeParse(req.query);
      if (!parsed.success) return next(parsed.error);
      const scope = await resolveOperationalBranch(req.user, parsed.data.branchId);
      return ok(
        res,
        await invoicesQueryService.list(
          scope.businessId,
          scope.branchId,
          parsed.data,
        ),
      );
    } catch (error) {
      return next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
        return fail(res, "Business id missing", 403, "FORBIDDEN");
      }
      const parsed = invoiceIdParamsSchema.safeParse(req.params);
      if (!parsed.success) return next(parsed.error);
      const branchId = await resolveInvoiceBranch(req, businessId, parsed.data.id);
      return ok(
        res,
        await invoicesQueryService.get(parsed.data.id, businessId, branchId),
      );
    } catch (error) {
      return next(error);
    }
  }

  async collect(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      const userId = req.user?.id;
      if (!businessId || !userId) {
        return fail(res, "Business user context missing", 403, "FORBIDDEN");
      }
      const parsed = collectPaymentSchema.safeParse(req.body);
      if (!parsed.success) return next(parsed.error);
      await resolveAppointmentBranch(req, businessId, parsed.data.appointmentId);
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
      await resolveInvoiceBranch(req, businessId, params.data.id);
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

  async receipt(req: Request, res: Response, next: NextFunction) {
    try {
      const businessId = req.user?.businessId;
      if (!businessId) {
        return fail(res, "Business id missing", 403, "FORBIDDEN");
      }

      const params = invoiceIdParamsSchema.safeParse(req.params);
      if (!params.success) return next(params.error);
      const branchId = await resolveInvoiceBranch(req, businessId, params.data.id);
      const invoice = await invoicesQueryService.get(
        params.data.id,
        businessId,
        branchId,
      );
      const doc = createReceiptDocument(invoice);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="receipt-${invoice.invoiceNumber}.pdf"`,
      );
      doc.pipe(res);
      doc.end();
    } catch (error) {
      return next(error);
    }
  }
}

export default new InvoiceWorkspaceController();
