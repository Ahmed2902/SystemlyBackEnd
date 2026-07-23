import { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import type {
  CreateCustomerBody,
  ListCustomersQuery,
  UpdateCustomerBody,
} from "./customers.schema";

const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.pending,
  AppointmentStatus.confirmed,
  AppointmentStatus.in_progress,
];

function notFoundError() {
  const error = new Error("Customer not found") as Error & {
    statusCode?: number;
    code?: string;
  };
  error.statusCode = 404;
  error.code = "NOT_FOUND";
  return error;
}

function normalizeNullable(value: string | null | undefined) {
  if (value === undefined) return undefined;
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

const appointmentSelect = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true,
  bookingChannel: true,
  appointmentServices: {
    orderBy: { order: "asc" as const },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      service: { select: { id: true, name: true } },
      staff: { select: { id: true, name: true } },
    },
  },
  invoices: {
    where: { status: { not: "voided" } },
    orderBy: { issuedAt: "desc" as const },
    take: 1,
    select: { status: true },
  },
} satisfies Prisma.AppointmentSelect;

function withCurrentInvoice<
  T extends { invoices: Array<{ status: string }> },
>({ invoices, ...appointment }: T) {
  return { ...appointment, invoice: invoices[0] ?? null };
}

class CustomersService {
  async listCustomers(businessId: string, query: ListCustomersQuery) {
    const now = new Date();
    const where: Prisma.CustomerWhereInput = {
      businessId,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    if (query.filter === "upcoming") {
      where.appointments = {
        some: { startsAt: { gte: now }, status: { in: ACTIVE_STATUSES } },
      };
    } else if (query.filter === "no_upcoming") {
      where.appointments = {
        none: { startsAt: { gte: now }, status: { in: ACTIVE_STATUSES } },
      };
    } else if (query.filter === "no_shows") {
      where.appointments = { some: { status: AppointmentStatus.no_show } };
    } else if (query.filter === "recent") {
      const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      where.createdAt = { gte: since };
    }

    const skip = (query.page - 1) * query.perPage;
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: query.perPage,
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      }),
      prisma.customer.count({ where }),
    ]);

    const customerIds = customers.map((customer) => customer.id);
    if (customerIds.length === 0) {
      return { items: [], total, page: query.page, perPage: query.perPage };
    }

    const [statusCounts, completed, upcoming] = await Promise.all([
      prisma.appointment.groupBy({
        by: ["customerId", "status"],
        where: { businessId, customerId: { in: customerIds } },
        _count: { _all: true },
      }),
      prisma.appointment.findMany({
        where: {
          businessId,
          customerId: { in: customerIds },
          status: AppointmentStatus.completed,
        },
        orderBy: { startsAt: "desc" },
        select: { customerId: true, startsAt: true },
      }),
      prisma.appointment.findMany({
        where: {
          businessId,
          customerId: { in: customerIds },
          startsAt: { gte: now },
          status: { in: ACTIVE_STATUSES },
        },
        orderBy: { startsAt: "asc" },
        select: { id: true, customerId: true, startsAt: true, status: true },
      }),
    ]);

    const counts = new Map<string, { visits: number; noShows: number }>();
    for (const row of statusCounts) {
      const current = counts.get(row.customerId) ?? { visits: 0, noShows: 0 };
      if (row.status === AppointmentStatus.completed) {
        current.visits = row._count._all;
      }
      if (row.status === AppointmentStatus.no_show) {
        current.noShows = row._count._all;
      }
      counts.set(row.customerId, current);
    }

    const lastVisitByCustomer = new Map<string, Date>();
    for (const row of completed) {
      if (!lastVisitByCustomer.has(row.customerId)) {
        lastVisitByCustomer.set(row.customerId, row.startsAt);
      }
    }

    const nextByCustomer = new Map<string, (typeof upcoming)[number]>();
    for (const row of upcoming) {
      if (!nextByCustomer.has(row.customerId)) {
        nextByCustomer.set(row.customerId, row);
      }
    }

    return {
      items: customers.map((customer) => ({
        ...customer,
        visits: counts.get(customer.id)?.visits ?? 0,
        noShows: counts.get(customer.id)?.noShows ?? 0,
        lastVisitAt: lastVisitByCustomer.get(customer.id) ?? null,
        nextAppointment: nextByCustomer.get(customer.id) ?? null,
      })),
      total,
      page: query.page,
      perPage: query.perPage,
    };
  }

  async createCustomer(businessId: string, input: CreateCustomerBody) {
    return prisma.customer.create({
      data: {
        businessId,
        name: input.name.trim(),
        phone: input.phone.trim(),
        email: normalizeNullable(input.email),
        acquisitionSource: normalizeNullable(input.acquisitionSource),
        notes: normalizeNullable(input.notes),
      },
    });
  }

  async getCustomerById(id: string, businessId: string) {
    return prisma.customer.findFirst({ where: { id, businessId } });
  }

  async updateCustomer(
    id: string,
    businessId: string,
    input: UpdateCustomerBody,
  ) {
    const existing = await this.getCustomerById(id, businessId);
    if (!existing) throw notFoundError();

    return prisma.customer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.phone !== undefined ? { phone: input.phone.trim() } : {}),
        ...(input.email !== undefined
          ? { email: normalizeNullable(input.email) }
          : {}),
        ...(input.acquisitionSource !== undefined
          ? { acquisitionSource: normalizeNullable(input.acquisitionSource) }
          : {}),
        ...(input.notes !== undefined
          ? { notes: normalizeNullable(input.notes) }
          : {}),
      },
    });
  }

  async updateNotes(
    id: string,
    businessId: string,
    notes?: string | null,
  ) {
    return this.updateCustomer(id, businessId, { notes });
  }

  async getWorkspace(id: string, businessId: string) {
    const customer = await this.getCustomerById(id, businessId);
    if (!customer) throw notFoundError();

    const now = new Date();
    const appointments = await prisma.appointment.findMany({
      where: { customerId: id, businessId },
      orderBy: { startsAt: "desc" },
      select: appointmentSelect,
    });

    const normalizedAppointments = appointments.map(withCurrentInvoice);
    const visits = normalizedAppointments.filter(
      (appointment) => appointment.status === AppointmentStatus.completed,
    );
    const noShows = normalizedAppointments.filter(
      (appointment) => appointment.status === AppointmentStatus.no_show,
    );
    const upcoming = normalizedAppointments
      .filter(
        (appointment) =>
          appointment.startsAt >= now && ACTIVE_STATUSES.includes(appointment.status),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    const history = normalizedAppointments.filter(
      (appointment) => !upcoming.some((item) => item.id === appointment.id),
    );

    return {
      customer,
      stats: {
        visits: visits.length,
        noShows: noShows.length,
        lastVisitAt: visits[0]?.startsAt ?? null,
        nextAppointmentAt: upcoming[0]?.startsAt ?? null,
      },
      upcoming,
      history,
    };
  }

  async getAppointments(customerId: string, businessId: string) {
    const workspace = await this.getWorkspace(customerId, businessId);
    return [...workspace.upcoming, ...workspace.history];
  }
}

export default new CustomersService();
