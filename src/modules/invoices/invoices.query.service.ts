import { InvoiceStatus, Prisma } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../shared/db/prisma";
import type { ListInvoicesQuery } from "./invoices.workspace.schema";

const ACTIVE_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.paid,
  InvoiceStatus.voided,
];

const buildError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const invoiceIdentitySelect = {
  id: true,
  businessId: true,
  appointmentId: true,
  customerId: true,
  invoiceNumber: true,
  status: true,
  subtotalCents: true,
  discountCents: true,
  taxCents: true,
  totalCents: true,
  currency: true,
  notes: true,
  issuedAt: true,
  paidAt: true,
  voidedAt: true,
  paymentMethod: true,
  paymentReference: true,
  paidByUserId: true,
  voidedByUserId: true,
  voidReason: true,
  createdAt: true,
  updatedAt: true,
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
} satisfies Prisma.InvoiceSelect;

const invoiceLineItemInclude = {
  service: { select: { id: true, name: true } },
  staff: { select: { id: true, name: true } },
} satisfies Prisma.InvoiceLineItemInclude;

// Command paths use this projection when an invoice must be returned from the
// same transaction. Query paths can load line items in parallel below.
export const invoiceDetailInclude = {
  customer: invoiceIdentitySelect.customer,
  business: invoiceIdentitySelect.business,
  appointment: invoiceIdentitySelect.appointment,
  paidBy: invoiceIdentitySelect.paidBy,
  voidedBy: invoiceIdentitySelect.voidedBy,
  lineItems: {
    orderBy: { createdAt: "asc" as const },
    include: invoiceLineItemInclude,
  },
} satisfies Prisma.InvoiceInclude;

class InvoicesQueryService {
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
          appointment: { select: { id: true, startsAt: true } },
          lineItems: {
            where: { serviceId: { not: null } },
            orderBy: { createdAt: "asc" },
            take: 3,
            select: { description: true },
          },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      items: items.map(({ lineItems, ...invoice }) => ({
        ...invoice,
        services: lineItems.map((item) => item.description),
      })),
      total,
      page: query.page,
      perPage: query.perPage,
    };
  }

  async get(invoiceId: string, businessId: string) {
    // Both reads are tenant-scoped and parameterised by Prisma. Running them in
    // parallel avoids serial relation loading over a high-latency DB link.
    const [invoice, lineItems] = await Promise.all([
      prisma.invoice.findFirst({
        where: { id: invoiceId, businessId },
        select: invoiceIdentitySelect,
      }),
      prisma.invoiceLineItem.findMany({
        where: { invoice: { id: invoiceId, businessId } },
        orderBy: { createdAt: "asc" },
        include: invoiceLineItemInclude,
      }),
    ]);

    if (!invoice) throw buildError("Invoice not found", 404, "NOT_FOUND");
    return { ...invoice, lineItems };
  }
}

export default new InvoicesQueryService();
