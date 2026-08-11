import { Prisma, Roles } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { resolveOperationalBranch } from "../../shared/services/branch-context.service";
import { getBusinessDayRange } from "../../shared/utils/timezone";
import { getCachedBusinessTimezone } from "../calendar/calendar.query.service";
import appointmentPhotoService from "./appointment-photo.service";
import type { ListAppointmentsQuery } from "./appointments.schema";

type AuthUser = NonNullable<Express.Request["user"]>;
type ListAppointmentsInput = ListAppointmentsQuery & { user: AuthUser };

const APPOINTMENT_LIST_SELECT = {
  id: true,
  branchId: true,
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
  branch: true,
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
    const { user, branchId, date, from, to, page = 1, perPage = 20 } = opts;
    const where: Prisma.AppointmentWhereInput = {};
    let businessTimezone = "UTC";
    let resolvedBranchId: string | undefined;

    if (user.role !== Roles.SuperAdmin) {
      if (!user.businessId) return { items: [], total: 0, page, perPage };
      const scope = await resolveOperationalBranch(user, branchId);
      where.businessId = scope.businessId;
      where.branchId = scope.branchId;
      resolvedBranchId = scope.branchId;
      if (date) businessTimezone = scope.branch.timezone;
    } else if (branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: branchId } });
      if (!branch) return { items: [], total: 0, page, perPage };
      where.branchId = branch.id;
      resolvedBranchId = branch.id;
      businessTimezone = branch.timezone;
    }

    if (date) {
      if (businessTimezone === "UTC" && user.businessId) {
        businessTimezone = await getCachedBusinessTimezone(user.businessId);
      }
      const { start, end } = getBusinessDayRange(businessTimezone, date);
      where.AND = [{ startsAt: { lt: end } }, { endsAt: { gt: start } }];
    } else if (from || to) {
      const range: Prisma.AppointmentWhereInput[] = [];
      if (from) range.push({ startsAt: { gte: new Date(from) } });
      if (to) range.push({ endsAt: { lte: new Date(to) } });
      where.AND = range;
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
      branchId: resolvedBranchId,
      items: items.map(({ invoices, ...appointment }) => ({
        ...appointment,
        invoice: invoices[0] ?? null,
      })),
      total,
      page,
      perPage,
    };
  }

  async getAppointmentById(id: string, businessId: string, user?: AuthUser) {
    const appointment = await prisma.appointment.findFirst({
      relationLoadStrategy: "join",
      where: { id, businessId },
      include: APPOINTMENT_DETAIL_INCLUDE,
    });
    if (!appointment) return null;
    if (user) {
      if (!appointment.branchId) return null;
      await resolveOperationalBranch(user, appointment.branchId);
    }
    return appointmentPhotoService.presentAppointment(
      withCurrentInvoice(appointment),
    );
  }

  listAppointmentPhotos(appointmentId: string, businessId: string) {
    return appointmentPhotoService.list(appointmentId, businessId);
  }
}

export default new AppointmentsQueryService();
