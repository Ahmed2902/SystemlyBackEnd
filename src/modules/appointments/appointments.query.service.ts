import { Prisma, Roles } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { getBusinessDayRange } from "../../shared/utils/timezone";
import type { ListAppointmentsQuery } from "./appointments.schema";
import { getOwnedAppointmentOrThrow } from "./appointments.helper";
import { getCachedBusinessTimezone } from "../calendar/calendar.query.service";

type ListAppointmentsInput = ListAppointmentsQuery & {
  user: NonNullable<Express.Request["user"]>;
};

const APPOINTMENT_LIST_SELECT = {
  id: true,
  customerId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  discountCents: true,
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      visitCount: true,
      noShowCount: true,
    },
  },
  appointmentServices: {
    orderBy: { order: "asc" },
    select: {
      id: true,
      serviceId: true,
      staffId: true,
      startsAt: true,
      endsAt: true,
      priceEgpSnapshot: true,
      service: { select: { id: true, name: true } },
    },
  },
  customItems: {
    select: {
      id: true,
      description: true,
      quantity: true,
      priceCents: true,
    },
  },
  invoices: {
    where: { status: { not: "voided" } },
    orderBy: { issuedAt: "desc" },
    take: 1,
    select: { id: true, status: true },
  },
} satisfies Prisma.AppointmentSelect;

const APPOINTMENT_DETAIL_INCLUDE = {
  customer: true,
  appointmentServices: { include: { service: true, staff: true } },
  staff: true,
  customItems: true,
  invoices: {
    where: { status: { not: "voided" } },
    orderBy: { issuedAt: "desc" },
    take: 1,
  },
  clinicVisitRecord: true,
  appointmentPhotos: { include: { photo: true } },
} satisfies Prisma.AppointmentInclude;

function withCurrentInvoice<T extends { invoices: unknown[] }>({
  invoices,
  ...appointment
}: T) {
  return { ...appointment, invoice: invoices[0] ?? null };
}

class AppointmentsQueryService {
  async listAppointments(opts: ListAppointmentsInput) {
    const { user, date, from, to, page = 1, perPage = 20 } = opts;
    const where: Prisma.AppointmentWhereInput = {};
    let businessTimezone = "UTC";

    if (user.role !== Roles.SuperAdmin.toString()) {
      if (!user.businessId) {
        return { items: [], total: 0, page, perPage };
      }
      where.businessId = user.businessId;

      if (date) {
        businessTimezone = await getCachedBusinessTimezone(user.businessId);
      }
    }

    if (date) {
      const { start, end } = getBusinessDayRange(businessTimezone, date);
      where.AND = [{ startsAt: { lt: end } }, { endsAt: { gt: start } }];
    } else if (from || to) {
      const range: Prisma.AppointmentWhereInput[] = [];
      if (from) range.push({ startsAt: { gte: new Date(from) } });
      if (to) range.push({ endsAt: { lte: new Date(to) } });
      where.AND = range;
    }

    if (user.role === Roles.Staff.toString()) {
      where.appointmentServices = { some: { staffId: user.id } };
    }

    const skip = (page - 1) * perPage;
    const [items, total] = await Promise.all([
      prisma.appointment.findMany({
        relationLoadStrategy: "join",
        where,
        skip,
        take: perPage,
        orderBy: { startsAt: "desc" },
        select: APPOINTMENT_LIST_SELECT,
      }),
      prisma.appointment.count({ where }),
    ]);

    return {
      items: items.map(({ invoices, ...appointment }) => ({
        ...appointment,
        invoice: invoices[0] ?? null,
      })),
      total,
      page,
      perPage,
    };
  }

  async getAppointmentById(id: string) {
    const appointment = await prisma.appointment.findUnique({
      relationLoadStrategy: "join",
      where: { id },
      include: APPOINTMENT_DETAIL_INCLUDE,
    });
    return appointment ? withCurrentInvoice(appointment) : null;
  }

  async listAppointmentPhotos(appointmentId: string, businessId: string) {
    await getOwnedAppointmentOrThrow(prisma, appointmentId, businessId);
    return prisma.appointmentPhoto.findMany({
      where: { appointmentId },
      include: { photo: true },
      orderBy: { createdAt: "asc" },
    });
  }
}

export default new AppointmentsQueryService();
