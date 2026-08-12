import {
  AppointmentStatus,
  CommissionType,
  InvoiceStatus,
  Prisma,
} from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../shared/db/prisma";
import { withSerializableRetry } from "../../shared/db/transaction-retry";
import { invalidateAnalyticsCache } from "../analytics/analytics.service";
import { updateAppointmentInTransaction } from "../appointments/appointments.command.service";
import appointmentsQueryService from "../appointments/appointments.query.service";
import { invoiceDetailInclude } from "./invoices.query.service";
import type {
  CollectPaymentInput,
  VoidInvoiceInput,
} from "./invoices.workspace.schema";

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

async function completeAppointmentForPayment(
  tx: Prisma.TransactionClient,
  input: {
    appointmentId: string;
    businessId: string;
    currentStatus: AppointmentStatus;
    discountCents: number;
  },
) {
  if (input.currentStatus === AppointmentStatus.completed) {
    const keptCompleted = await tx.appointment.updateMany({
      where: {
        id: input.appointmentId,
        businessId: input.businessId,
        status: AppointmentStatus.completed,
      },
      data: { discountCents: input.discountCents },
    });
    if (keptCompleted.count === 1) return false;
  } else {
    const transitioned = await tx.appointment.updateMany({
      where: {
        id: input.appointmentId,
        businessId: input.businessId,
        status: input.currentStatus,
      },
      data: {
        status: AppointmentStatus.completed,
        discountCents: input.discountCents,
      },
    });
    if (transitioned.count === 1) return true;
  }

  const current = await tx.appointment.findFirst({
    where: { id: input.appointmentId, businessId: input.businessId },
    select: { status: true },
  });
  if (current?.status === AppointmentStatus.completed) {
    await tx.appointment.updateMany({
      where: {
        id: input.appointmentId,
        businessId: input.businessId,
        status: AppointmentStatus.completed,
      },
      data: { discountCents: input.discountCents },
    });
    return false;
  }

  throw buildError(
    "Appointment state changed while collecting payment",
    409,
    "APPOINTMENT_STATE_CHANGED",
  );
}

class InvoicesCommandService {
  async collectPayment(
    businessId: string,
    userId: string,
    input: CollectPaymentInput,
  ) {
    let invoice;

    try {
      invoice = await withSerializableRetry(() =>
        prisma.$transaction(
          async (tx) => {
            const existingPaid = await tx.invoice.findFirst({
              where: {
                businessId,
                appointmentId: input.appointmentId,
                status: InvoiceStatus.paid,
              },
              include: invoiceDetailInclude,
            });
            if (existingPaid) return existingPaid;

            if (input.appointmentUpdate) {
              await updateAppointmentInTransaction(
                tx,
                input.appointmentId,
                businessId,
                input.appointmentUpdate,
              );
            }

            const appointment = await tx.appointment.findFirst({
              where: { id: input.appointmentId, businessId },
              select: {
                id: true,
                businessId: true,
                branchId: true,
                customerId: true,
                startsAt: true,
                status: true,
                business: { select: { timezone: true } },
                branch: { select: { timezone: true } },
                customItems: {
                  select: {
                    description: true,
                    quantity: true,
                    priceCents: true,
                  },
                },
                appointmentServices: {
                  orderBy: { order: "asc" },
                  select: {
                    serviceId: true,
                    staffId: true,
                    priceEgpSnapshot: true,
                    service: { select: { name: true } },
                  },
                },
              },
            });

            if (!appointment) {
              throw buildError("Appointment not found", 404, "NOT_FOUND");
            }
            if (!appointment.branchId) {
              throw buildError(
                "Appointment branch context is missing",
                409,
                "BRANCH_CONTEXT_REQUIRED",
              );
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
              select: {
                serviceId: true,
                staffId: true,
                commissionType: true,
                commissionAmount: true,
              },
            });
            const commissionByKey = new Map(
              commissionRows.map((row) => [
                `${row.staffId}:${row.serviceId}`,
                row,
              ]),
            );

            const serviceLines = appointment.appointmentServices.map(
              (segment) => {
                const totalCents = Math.round(
                  Number(segment.priceEgpSnapshot) * 100,
                );
                const commission = commissionByKey.get(
                  `${segment.staffId}:${segment.serviceId}`,
                );
                const commissionType =
                  commission?.commissionType ?? CommissionType.NONE;
                const commissionAmount =
                  commission?.commissionAmount ?? new Prisma.Decimal(0);

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
              },
            );

            const customLines = appointment.customItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPriceCents: item.priceCents,
              taxCents: 0,
              totalCents: item.quantity * item.priceCents,
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
            const discountCents =
              input.appointmentUpdate?.discountCents ?? input.discountCents;
            if (discountCents > subtotalCents) {
              throw buildError(
                "Discount cannot exceed the invoice subtotal",
                400,
                "INVALID_DISCOUNT",
              );
            }

            const issuedAt = new Date();
            const localYear = DateTime.fromJSDate(issuedAt)
              .setZone(appointment.branch?.timezone ?? appointment.business.timezone)
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

            const created = await tx.invoice.create({
              data: {
                businessId,
                branchId: appointment.branchId,
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
              include: invoiceDetailInclude,
            });

            const completedByPayment = await completeAppointmentForPayment(tx, {
              appointmentId: appointment.id,
              businessId,
              currentStatus: appointment.status,
              discountCents,
            });

            if (completedByPayment) {
              await tx.customer.update({
                where: { id: appointment.customerId },
                data: {
                  visitCount: { increment: 1 },
                  lastVisitAt: appointment.startsAt,
                },
              });
            }

            return created;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existingPaid = await prisma.invoice.findFirst({
          where: {
            businessId,
            appointmentId: input.appointmentId,
            status: InvoiceStatus.paid,
          },
          include: invoiceDetailInclude,
        });
        if (existingPaid) invoice = existingPaid;
        else throw error;
      } else {
        throw error;
      }
    }

    const updatedAppointment =
      await appointmentsQueryService.getAppointmentById(
        input.appointmentId,
        businessId,
      );
    if (!updatedAppointment) {
      throw buildError("Appointment not found", 404, "NOT_FOUND");
    }

    await invalidateAnalyticsCache(businessId);
    return { ...invoice, updatedAppointment };
  }

  async voidInvoice(
    invoiceId: string,
    businessId: string,
    userId: string,
    input: VoidInvoiceInput,
  ) {
    const result = await withSerializableRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const invoice = await tx.invoice.findFirst({
            where: { id: invoiceId, businessId },
            select: {
              id: true,
              status: true,
              appointmentId: true,
              customerId: true,
              appointment: {
                select: { id: true, status: true },
              },
            },
          });
          if (!invoice) {
            throw buildError("Invoice not found", 404, "NOT_FOUND");
          }
          if (invoice.status === InvoiceStatus.voided) {
            return tx.invoice.findFirstOrThrow({
              where: { id: invoice.id, businessId },
              include: invoiceDetailInclude,
            });
          }
          if (invoice.status !== InvoiceStatus.paid) {
            throw buildError(
              "Only paid invoices can be voided",
              409,
              "INVALID_INVOICE_STATE",
            );
          }

          const invoiceTransition = await tx.invoice.updateMany({
            where: {
              id: invoice.id,
              businessId,
              status: InvoiceStatus.paid,
            },
            data: {
              status: InvoiceStatus.voided,
              voidedAt: new Date(),
              voidedByUserId: userId,
              voidReason: input.reason,
            },
          });
          if (invoiceTransition.count === 0) {
            const current = await tx.invoice.findFirst({
              where: { id: invoice.id, businessId },
              include: invoiceDetailInclude,
            });
            if (current?.status === InvoiceStatus.voided) return current;
            throw buildError(
              "Invoice state changed while voiding it",
              409,
              "INVOICE_STATE_CHANGED",
            );
          }

          if (invoice.appointmentId && invoice.appointment) {
            const appointmentTransition = await tx.appointment.updateMany({
              where: {
                id: invoice.appointmentId,
                businessId,
                status: AppointmentStatus.completed,
              },
              data: { status: AppointmentStatus.in_progress },
            });

            if (appointmentTransition.count === 1) {
              const [latestCompleted, customer] = await Promise.all([
                tx.appointment.findFirst({
                  where: {
                    customerId: invoice.customerId,
                    businessId,
                    status: AppointmentStatus.completed,
                    id: { not: invoice.appointmentId },
                  },
                  orderBy: { startsAt: "desc" },
                  select: { startsAt: true },
                }),
                tx.customer.findUnique({
                  where: { id: invoice.customerId },
                  select: { visitCount: true },
                }),
              ]);
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
            include: invoiceDetailInclude,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );

    await invalidateAnalyticsCache(businessId);
    return result;
  }
}

export default new InvoicesCommandService();
