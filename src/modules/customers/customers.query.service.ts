import { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import type { ListCustomersQuery } from "./customers.schema";

const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.pending,
  AppointmentStatus.confirmed,
  AppointmentStatus.in_progress,
];
const CUSTOMER_HISTORY_LIMIT = 100;

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

const historyAppointmentSelect = {
  ...appointmentSelect,
  clinicVisitRecord: {
    select: {
      diagnosis: true,
      notes: true,
      prescriptionJson: true,
    },
  },
} satisfies Prisma.AppointmentSelect;

const customerProfileSelect = {
  id: true,
  businessId: true,
  name: true,
  phone: true,
  email: true,
  acquisitionSource: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;

function withCurrentInvoice<T extends { invoices: Array<{ status: string }> }>({
  invoices,
  ...appointment
}: T) {
  return { ...appointment, invoice: invoices[0] ?? null };
}

function hasClinicalContent(record: {
  diagnosis: string | null;
  notes: string | null;
  prescriptionJson: string | null;
}) {
  return Boolean(
    record.diagnosis?.trim() ||
      record.notes?.trim() ||
      record.prescriptionJson?.trim(),
  );
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

    if (query.view === "search") {
      const [items, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          skip,
          take: query.perPage,
          orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            phone: true,
            visitCount: true,
            lastVisitAt: true,
          },
        }),
        prisma.customer.count({ where }),
      ]);
      return { items, total, page: query.page, perPage: query.perPage };
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take: query.perPage,
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
        select: {
          ...customerProfileSelect,
          visitCount: true,
          noShowCount: true,
          lastVisitAt: true,
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
    return prisma.customer.findFirst({
      where: { id, businessId },
      select: customerProfileSelect,
    });
  }

  async getWorkspace(id: string, businessId: string) {
    const now = new Date();
    const [customer, upcoming, historyRows] = await Promise.all([
      prisma.customer.findFirst({
        where: { id, businessId },
        select: {
          ...customerProfileSelect,
          visitCount: true,
          noShowCount: true,
          lastVisitAt: true,
        },
      }),
      prisma.appointment.findMany({
        relationLoadStrategy: "join",
        where: {
          customerId: id,
          businessId,
          startsAt: { gte: now },
          status: { in: ACTIVE_STATUSES },
        },
        orderBy: { startsAt: "asc" },
        select: appointmentSelect,
      }),
      prisma.appointment.findMany({
        relationLoadStrategy: "join",
        where: {
          customerId: id,
          businessId,
          NOT: {
            startsAt: { gte: now },
            status: { in: ACTIVE_STATUSES },
          },
        },
        orderBy: { startsAt: "desc" },
        take: CUSTOMER_HISTORY_LIMIT + 1,
        select: historyAppointmentSelect,
      }),
    ]);
    if (!customer) throw notFoundError();

    const {
      visitCount,
      noShowCount,
      lastVisitAt,
      ...customerProfile
    } = customer;
    const normalizedUpcoming = upcoming.map(withCurrentInvoice);
    const historyHasMore = historyRows.length > CUSTOMER_HISTORY_LIMIT;
    const limitedHistoryRows = historyRows.slice(0, CUSTOMER_HISTORY_LIMIT);

    const history = limitedHistoryRows.map(
      ({ clinicVisitRecord: _clinicVisitRecord, ...appointment }) =>
        withCurrentInvoice(appointment),
    );

    const clinicalHistory = limitedHistoryRows.flatMap((appointment) => {
      const record = appointment.clinicVisitRecord;
      if (
        appointment.status !== AppointmentStatus.completed ||
        !record ||
        !hasClinicalContent(record)
      ) {
        return [];
      }

      const staff = Array.from(
        new Map(
          appointment.appointmentServices.map((segment) => [
            segment.staff.id,
            segment.staff,
          ]),
        ).values(),
      );

      return [
        {
          appointmentId: appointment.id,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          status: appointment.status,
          services: appointment.appointmentServices.map((segment) =>
            segment.service,
          ),
          staff,
          diagnosisAssessment: record.diagnosis,
          clinicalSessionNotes: record.notes,
          planAndPrescription: record.prescriptionJson,
        },
      ];
    });

    return {
      customer: customerProfile,
      stats: {
        visits: visitCount,
        noShows: noShowCount,
        lastVisitAt,
        nextAppointmentAt: normalizedUpcoming[0]?.startsAt ?? null,
      },
      upcoming: normalizedUpcoming,
      history,
      historyHasMore,
      clinicalHistory,
    };
  }

  async getAppointments(customerId: string, businessId: string) {
    const workspace = await this.getWorkspace(customerId, businessId);
    return [...workspace.upcoming, ...workspace.history];
  }
}

export default new CustomersQueryService();
