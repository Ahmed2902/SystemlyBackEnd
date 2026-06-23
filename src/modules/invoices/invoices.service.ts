import { prisma } from "../../shared/db/prisma";
import { AppointmentStatus, CommissionType, InvoiceStatus } from "@prisma/client";
import { triggerEtaReceipt } from "../../jobs/etaReceipt.job";
import loyaltyService from "../loyalty/loyalty.service";

const buildErr = (message: string, statusCode: number, code = "BAD_REQUEST") => {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
};

const commissionEarnedCents = (
  lineTotalCents: number,
  type: CommissionType | null | undefined,
  amount: number | null | undefined,
) => {
  if (type === CommissionType.FLAT) {
    return Math.round((amount ?? 0) * 100);
  }
  if (type === CommissionType.PERCENT) {
    return Math.round((lineTotalCents * (amount ?? 0)) / 100);
  }
  return 0;
};

class InvoicesService {
  /**
   * Checkout an appointment: creates an Invoice + InvoiceLineItem atomically.
   * Requires the appointment to be in "confirmed" or "completed" status.
   */
  async checkout(appointmentId: string, businessId: string) {
    const existing = await prisma.invoice.findUnique({
      where: { appointmentId },
      include: { lineItems: true, customer: true },
    });

    if (existing) {
      if (existing.businessId !== businessId) {
        throw buildErr("Appointment does not belong to this business", 403, "FORBIDDEN");
      }
      return existing;
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true, customer: true },
    });

    if (!appointment) {
      throw buildErr("Appointment not found", 404, "NOT_FOUND");
    }
    if (appointment.businessId !== businessId) {
      throw buildErr("Appointment does not belong to this business", 403, "FORBIDDEN");
    }
    if (
      appointment.status !== AppointmentStatus.confirmed &&
      appointment.status !== AppointmentStatus.completed
    ) {
      throw buildErr(
        "Appointment must be confirmed or completed to checkout",
        400,
      );
    }

    const servicePrice = Number(appointment.service.priceEgp);
    const priceCents = Math.round(servicePrice * 100);
    const commissionRow = await prisma.serviceStaff.findUnique({
      where: {
        serviceId_staffId: {
          serviceId: appointment.serviceId,
          staffId: appointment.staffId,
        },
      },
    });

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { slug: true },
    });
    const invNumber = `INV-${business?.slug ?? "UNKNOWN"}-${Date.now()}`;
    const commissionType = commissionRow?.commissionType ?? CommissionType.NONE;
    const commissionAmount = commissionRow?.commissionAmount ?? 0;
    const earnedCommissionCents = commissionEarnedCents(
      priceCents,
      commissionType,
      commissionAmount,
    );

    try {
      const invoice = await prisma.$transaction(async (tx) => {
        return tx.invoice.create({
          data: {
            appointmentId,
            businessId,
            customerId: appointment.customerId,
            invoiceNumber: invNumber,
            status: InvoiceStatus.sent,
            subtotalCents: priceCents,
            taxCents: 0,
            totalCents: priceCents,
            currency: "EGP",
            issuedAt: new Date(),
            lineItems: {
              create: {
                description: appointment.service.name,
                quantity: 1,
                unitPriceCents: priceCents,
                taxCents: 0,
                totalCents: priceCents,
                serviceId: appointment.serviceId,
                staffId: appointment.staffId,
                commissionType,
                commissionAmount,
                commissionEarnedCents: earnedCommissionCents,
              },
            },
          },
          include: {
            lineItems: true,
            customer: true,
          },
        });
      });

      return invoice;
    } catch (err: any) {
      if (err?.code === "P2002") {
        const retry = await prisma.invoice.findUnique({
          where: { appointmentId },
          include: { lineItems: true, customer: true },
        });
        if (retry) return retry;
      }
      throw err;
    }
  }

  /**
   * Mark an invoice as paid.
   */
  async markPaid(invoiceId: string, businessId: string) {
    const updatedCount = await prisma.invoice.updateMany({
      where: {
        id: invoiceId,
        businessId,
        status: { not: InvoiceStatus.paid },
      },
      data: {
        status: InvoiceStatus.paid,
        paidAt: new Date(),
      },
    });

    if (updatedCount.count === 0) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { lineItems: true, customer: true },
      });
      if (!invoice) {
        throw buildErr("Invoice not found", 404, "NOT_FOUND");
      }
      if (invoice.businessId !== businessId) {
        throw buildErr("Invoice does not belong to this business", 403, "FORBIDDEN");
      }
      if (invoice.status === InvoiceStatus.paid) {
        return invoice;
      }
      throw buildErr("Unable to mark invoice as paid", 409, "CONFLICT");
    }

    const updated = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { lineItems: true, customer: true },
    });
    if (!updated) {
      throw buildErr("Invoice not found", 404, "NOT_FOUND");
    }

    triggerEtaReceipt(updated).catch((err) =>
      console.error("[Invoices] ETA trigger failed:", err),
    );

    try {
      await loyaltyService.creditPointsForInvoice(updated as any);
    } catch (err: any) {
      if (err?.code !== "P2002") {
        console.error("[Invoices] Loyalty credit failed:", err);
      }
    }

    return updated;
  }

  async refund(invoiceId: string, businessId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { lineItems: true, customer: true },
    });

    if (!invoice) {
      throw buildErr("Invoice not found", 404, "NOT_FOUND");
    }
    if (invoice.businessId !== businessId) {
      throw buildErr("Invoice does not belong to this business", 403, "FORBIDDEN");
    }
    if (invoice.status === InvoiceStatus.voided) {
      throw buildErr("Invoice is already refunded", 400, "INVALID_STATE");
    }
    if (invoice.status !== InvoiceStatus.paid) {
      throw buildErr("Only paid invoices can be refunded", 400, "INVALID_STATE");
    }

    const refundAt = new Date();
    const refunded = await prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: InvoiceStatus.voided,
          voidedAt: refundAt,
        },
        include: { lineItems: true, customer: true },
      });

      await tx.loyaltyTransaction.create({
        data: {
          accountId: (
            await tx.loyaltyAccount.upsert({
              where: {
                customerId_businessId: {
                  customerId: invoice.customerId,
                  businessId,
                },
              },
              create: {
                customerId: invoice.customerId,
                businessId,
                pointsBalance: 0,
              },
              update: {},
            })
          ).id,
          invoiceId: invoice.id,
          points: -Math.floor(invoice.totalCents / 100),
          type: "refund",
        },
      });

      await tx.loyaltyAccount.updateMany({
        where: {
          customerId: invoice.customerId,
          businessId,
        },
        data: {
          pointsBalance: {
            decrement: Math.floor(invoice.totalCents / 100),
          },
        },
      });

      return updated;
    });

    return {
      invoice: refunded,
      refundedAt: refundAt,
      refundedCents: invoice.totalCents,
    };
  }

  /**
   * Get an invoice by id (for the receipt / detail view).
   */
  async getInvoice(invoiceId: string, businessId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { lineItems: true, customer: true, business: true },
    });

    if (!invoice) {
      throw Object.assign(new Error("Invoice not found"), { statusCode: 404 });
    }
    if (invoice.businessId !== businessId) {
      throw Object.assign(
        new Error("Invoice does not belong to this business"),
        {
          statusCode: 403,
        },
      );
    }

    return invoice;
  }
}

export default new InvoicesService();
