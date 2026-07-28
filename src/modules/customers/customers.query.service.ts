import { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import type { ListCustomersQuery } from "./customers.schema";

const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.pending,
  AppointmentStatus.confirmed,
  AppointmentStatus.in_progress,
];

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

function withCurrentInvoice<T extends { invoices: Array<{ status: string }> }>({
  invoices,
  ...appointment
}: T) {
  return { ...appointment, invoice: invoices[0] ?? null };
}

function notFoundError() {
  const error = new Error("Customer not found") as Error & {
    statusCode?: number;
    code?: string;
  };
  error.statusCode = 404;
  error.code = "NOT_FOUND";
  return error;
}

class CustomersQueryService {
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
      where.noShowCount = { gt: 0 };
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
        select: {
          id: true,
          businessId: true,
          name: true,
          phone: true,
          email: true,
          notes: true,
          acquisitionSource: true,
          visitCount: true,
          noShowCount: true,
          lastVisitAt: true,
          createdAt: true,
          updatedAt: true,
          appointments: {
            where: { startsAt: { gte: now }, status: { in: ACTIVE_STATUSES } },
            orderBy: { startsAt: "asc" },
            take: 1,
            select: { id: true, startsAt: true, status: true },
          },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    return {
      items: customers.map(({ appointments, visitCount, noShowCount, ...customer }) => ({
        ...customer,
        visits: visitCount,
        noShows: noShowCount,
        nextAppointment: appointments[0] ?? null,
      })),
      total,
      page: query.page,
      perPage: query.perPage,
    };
  }

  getCustomerById(id: string, businessId: string) {
    return prisma.customer.findFirst({ where: { id, businessId } });
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
    const upcomingIds = new Set(upcoming.map((appointment) => appointment.id));
    const history = normalizedAppointments.filter(
      (appointment) => !upcomingIds.has(appointment.id),
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

export default new CustomersQueryService();
