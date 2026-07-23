import {
  AppointmentStatus,
  CommissionType,
  InvoiceStatus,
  PaymentMethod,
  Prisma,
} from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../shared/db/prisma";
import type {
  CollectPaymentInput,
  ListInvoicesQuery,
  VoidInvoiceInput,
} from "./invoices.workspace.schema";

const ACTIVE_INVOICE_STATUSES = [InvoiceStatus.paid, InvoiceStatus.voided];

const buildError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const commissionEarnedCents = (
  lineTotalCents: number,
  type: CommissionType | null | undefined,
  amount: Prisma.Decimal | number | null | undefined,
) => {
  const numericAmount = Number(amount ?? 0);
  if (type === CommissionType.FLAT) return Math.round(numericAmount * 100);
  if (type === CommissionType.PERCENT) {
    return Math.round((lineTotalCents * numericAmount) / 100);
  }
  return 0;
};

const invoiceInclude = {
  customer: {
    select: { id: true, name: true, phone: true, email: true },
  },
  business: {
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      city: true,
      logoUrl: true,
      timezone: true,
    },
  },
  appointment: {
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      bookingChannel: true,
    },
  },
  paidBy: { select: { id: true, name: true } },
  voidedBy: { select: { id: true, name: true } },
  lineItems: {
    orderBy: { createdAt: "asc" as const },
    include: {
      service: { select: { id: true, name: true } },
      staff: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.InvoiceInclude;

class InvoiceWorkspaceService {
  async list(businessId: string, query: ListInvoicesQuery) {
    const where: Prisma.InvoiceWhereInput = {
      businessId,
      status: query.status ?? { in: ACTIVE_INVOICE_STATUSES },
    };

    if (query.paymentMethod) where.paymentMethod = query.paymentMethod;

    if (query.from || query.to) {
      where.issuedAt = {
        ...(query.from
          ? { gte: DateTime.fromISO(query.from).startOf("day").toJSDate() }
          : {}),
        ...(query.to
          ? { lte: DateTime.fromISO(query.to).endOf("day").toJSDate() }
          : {}),
      };
    }

    if (query.search) {
      where.OR = [
        { invoiceNumber: { contains: query.search, mode: "insensitive" } },
        {
          customer: {
            is: {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { phone: { contains: query.search, mode: "insensitive" } },
              ],
            },
          },
        },
      ];
    }

    const skip = (query.page - 1) * query.perPage;
    const [items, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip,
        take: query.perPage,
        orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          issuedAt: true,
          paidAt: true,
          voidedAt: true,
          paymentMethod: true,
          totalCents: true,
          currency: true,
          customer: { select: { id: true, name: true, phone: true } },
          appointment: {
            select: {
              id: true,
              startsAt: true,
              appointmentServices: {
                orderBy: { order: "asc" },
                take: 3,
                select: { service: { select: { name: true } } },
              },
            },
          },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      items: items.map((invoice) => ({
        ...invoice,
        services:
          invoice.appointment?.appointmentServices.map(
            (segment) => segment.service.name,
          ) ?? [],
      })),
      total,
      page: query.page,
      perPage: query.perPage,
    };
  }

  async get(invoiceId: string, businessId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      include: invoiceInclude,
    });
    if (!invoice) throw buildError("Invoice not found", 404, "NOT_FOUND");
    return invoice;
  }

  async collectPayment(
    businessId: string,
    userId: string,
    input: CollectPaymentInput,
  ) {
    return prisma.$transaction(
      async (tx) => {
        const existingPaid = await tx.invoice.findFirst({
          where: {
            businessId,
            appointmentId: input.appointmentId,
            status: InvoiceStatus.paid,
          },
          include: invoiceInclude,
        });
        if (existingPaid) return existingPaid;

        const appointment = await tx.appointment.findFirst({
          where: { id: input.appointmentId, businessId },
          include: {
            business: { select: { timezone: true } },
            customer: true,
            customItems: true,
            appointmentServices: {
              orderBy: { order: "asc" },
              include: { service: true },
            },
          },
        });

        if (!appointment) {
          throw buildError("Appointment not found", 404, "NOT_FOUND");
        }
        if (
          appointment.status === AppointmentStatus.cancelled_by_business ||
          appointment.status === AppointmentStatus.cancelled_by_customer ||
          appointment.status === AppointmentStatus.no_show
        ) {
          throw buildError(
            "This appointment cannot be paid in its current status",
            409,
            "INVALID_APPOINTMENT_STATE",
          );
        }
        if (appointment.appointmentServices.length === 0) {
          throw buildError(
            "Appointment has no services",
            400,
            "INVALID_STATE",
          );
        }

        const commissionRows = await tx.serviceStaff.findMany({
          where: {
            OR: appointment.appointmentServices.map((segment) => ({
              serviceId: segment.serviceId,
              staffId: segment.staffId,
            })),
          },
        });
        const commissionByKey = new Map(
          commissionRows.map((row) => [
            `${row.staffId}:${row.serviceId}`,
            row,
          ]),
        );

        const serviceLines = appointment.appointmentServices.map((segment) => {
          const totalCents = Math.round(Number(segment.priceEgpSnapshot) * 100);
          const commission = commissionByKey.get(
            `${segment.staffId}:${segment.serviceId}`,
          );
          const commissionType =
            commission?.commissionType ?? CommissionType.NONE;
          const commissionAmount = commission?.commissionAmount ?? new Prisma.Decimal(0);

          return {
            description: segment.service.name,
            quantity: 1,
            unitPriceCents: totalCents,
            taxCents: 0,
            totalCents,
            serviceId: segment.serviceId,
            staffId: segment.staffId,
            commissionType,
            commissionAmount,
            commissionEarnedCents: commissionEarnedCents(
              totalCents,
              commissionType,
              commissionAmount,
            ),
          };
        });

        const customLines = appointment.customItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          taxCents: 0,
          totalCents: item.quantity * item.unitPriceCents,
          serviceId: null,
          staffId: null,
          commissionType: CommissionType.NONE,
          commissionAmount: new Prisma.Decimal(0),
          commissionEarnedCents: 0,
        }));

        const lineItems = [...serviceLines, ...customLines];
        const subtotalCents = lineItems.reduce(
          (sum, line) => sum + line.totalCents,
          0,
        );
        const discountCents = input.discountCents;
        if (discountCents > subtotalCents) {
          throw buildError(
            "Discount cannot exceed the invoice subtotal",
            400,
            "INVALID_DISCOUNT",
          );
        }

        const issuedAt = new Date();
        const localYear = DateTime.fromJSDate(issuedAt)
          .setZone(appointment.business.timezone)
          .year;
        const counter = await tx.invoiceCounter.upsert({
          where: {
            businessId_year: { businessId, year: localYear },
          },
          create: { businessId, year: localYear, lastNumber: 1 },
          update: { lastNumber: { increment: 1 } },
        });
        const invoiceNumber = `INV-${localYear}-${String(
          counter.lastNumber,
        ).padStart(4, "0")}`;

        const wasCompleted = appointment.status === AppointmentStatus.completed;
        const invoice = await tx.invoice.create({
          data: {
            businessId,
            appointmentId: appointment.id,
            customerId: appointment.customerId,
            invoiceNumber,
            status: InvoiceStatus.paid,
            subtotalCents,
            discountCents,
            taxCents: 0,
            totalCents: subtotalCents - discountCents,
            currency: "EGP",
            notes: input.notes?.trim() || null,
            issuedAt,
            paidAt: issuedAt,
            paymentMethod: input.paymentMethod,
            paymentReference: input.paymentReference?.trim() || null,
            paidByUserId: userId,
            lineItems: { create: lineItems },
          },
          include: invoiceInclude,
        });

        await tx.appointment.update({
          where: { id: appointment.id },
          data: {
            status: AppointmentStatus.completed,
            discountCents,
          },
        });

        if (!wasCompleted) {
          await tx.customer.update({
            where: { id: appointment.customerId },
            data: {
              visitCount: { increment: 1 },
              lastVisitAt: appointment.startsAt,
            },
          });
        }

        return invoice;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async voidInvoice(
    invoiceId: string,
    businessId: string,
    userId: string,
    input: VoidInvoiceInput,
  ) {
    return prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, businessId },
        include: { appointment: true },
      });
      if (!invoice) throw buildError("Invoice not found", 404, "NOT_FOUND");
      if (invoice.status === InvoiceStatus.voided) {
        return tx.invoice.findFirstOrThrow({
          where: { id: invoice.id, businessId },
          include: invoiceInclude,
        });
      }
      if (invoice.status !== InvoiceStatus.paid) {
        throw buildError(
          "Only paid invoices can be voided",
          409,
          "INVALID_INVOICE_STATE",
        );
      }

      const voidedAt = new Date();
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.voided,
          voidedAt,
          voidedByUserId: userId,
          voidReason: input.reason,
        },
      });

      if (invoice.appointmentId && invoice.appointment) {
        const wasCompleted =
          invoice.appointment.status === AppointmentStatus.completed;
        await tx.appointment.update({
          where: { id: invoice.appointmentId },
          data: { status: AppointmentStatus.in_progress },
        });

        if (wasCompleted) {
          const latestCompleted = await tx.appointment.findFirst({
            where: {
              customerId: invoice.customerId,
              businessId,
              status: AppointmentStatus.completed,
              id: { not: invoice.appointmentId },
            },
            orderBy: { startsAt: "desc" },
            select: { startsAt: true },
          });
          const customer = await tx.customer.findUnique({
            where: { id: invoice.customerId },
            select: { visitCount: true },
          });
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: {
              ...(customer && customer.visitCount > 0
                ? { visitCount: { decrement: 1 } }
                : {}),
              lastVisitAt: latestCompleted?.startsAt ?? null,
            },
          });
        }
      }

      return tx.invoice.findFirstOrThrow({
        where: { id: invoice.id, businessId },
        include: invoiceInclude,
      });
    });
  }
}

export default new InvoiceWorkspaceService();
