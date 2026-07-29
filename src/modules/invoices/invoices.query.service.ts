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

export const invoiceDetailInclude = {
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
          appointment: {
            select: {
              id: true,
              startsAt: true,
            },
          },
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
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      include: invoiceDetailInclude,
    });
    if (!invoice) throw buildError("Invoice not found", 404, "NOT_FOUND");
    return invoice;
  }
}

export default new InvoicesQueryService();