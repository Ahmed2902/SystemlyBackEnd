import { prisma } from "../../shared/db/prisma";
import { AppointmentStatus, InvoiceStatus } from "@prisma/client";
import { triggerEtaReceipt } from "../../jobs/etaReceipt.job";

class InvoicesService {
  /**
   * Checkout an appointment: creates an Invoice + InvoiceLineItem atomically.
   * Requires the appointment to be in "confirmed" or "completed" status.
   */
  async checkout(appointmentId: string, businessId: string) {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true, customer: true },
    });

    if (!appointment) {
      throw Object.assign(new Error("Appointment not found"), {
        statusCode: 404,
      });
    }
    if (appointment.businessId !== businessId) {
      throw Object.assign(
        new Error("Appointment does not belong to this business"),
        {
          statusCode: 403,
        },
      );
    }
    if (
      appointment.status !== AppointmentStatus.confirmed &&
      appointment.status !== AppointmentStatus.completed
    ) {
      throw Object.assign(
        new Error("Appointment must be confirmed or completed to checkout"),
        { statusCode: 400 },
      );
    }

    const servicePrice = Number(appointment.service.priceEgp);
    const priceCents = Math.round(servicePrice * 100);

    // Generate a simple invoice number: INV-{businessId slug}-{timestamp}
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { slug: true },
    });
    const invNumber = `INV-${business?.slug ?? "UNKNOWN"}-${Date.now()}`;

    const [invoice] = await prisma.$transaction([
      prisma.invoice.create({
        data: {
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
            },
          },
        },
        include: {
          lineItems: true,
          customer: true,
        },
      }),
    ]);

    return invoice;
  }

  /**
   * Mark an invoice as paid.
   */
  async markPaid(invoiceId: string, businessId: string) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
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
    if (invoice.status === InvoiceStatus.paid) {
      throw Object.assign(new Error("Invoice is already paid"), {
        statusCode: 400,
      });
    }

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.paid,
        paidAt: new Date(),
      },
      include: { lineItems: true, customer: true },
    });

    // Fire-and-forget ETA receipt submission (non-blocking)
    triggerEtaReceipt(updated).catch((err) =>
      console.error("[Invoices] ETA trigger failed:", err),
    );

    return updated;
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
