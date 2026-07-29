import { AppointmentStatus, Prisma, Roles } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../shared/db/prisma";
import type { StaffDirectoryQuery } from "./staff.schema";
import staffService from "./staff.service";
import staffWorkspaceService from "./staff.workspace.service";

type AuthUser = NonNullable<Express.Request["user"]>;

type StaffMetricsRow = {
  total: bigint;
  active: bigint;
  availableToday: bigint;
  onTimeOff: bigint;
};

const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.pending,
  AppointmentStatus.confirmed,
  AppointmentStatus.in_progress,
];

const buildError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & { statusCode: number; code: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const canManageMoney = (role?: string) =>
  role === Roles.BusinessAdmin || role === Roles.SuperAdmin;

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

function numberFromCount(value: bigint | number | string | undefined) {
  const result = Number(value ?? 0);
  return Number.isSafeInteger(result) && result >= 0 ? result : 0;
}

class StaffQueryService {
  async listDirectory(user: AuthUser, query: StaffDirectoryQuery) {
    if (!user.businessId) throw buildError("Business id missing", 400, "BAD_REQUEST");

    const business = await prisma.business.findUnique({
      where: { id: user.businessId },
      select: { id: true, timezone: true },
    });
    if (!business) throw buildError("Business not found", 404, "NOT_FOUND");

    const ownerView = canManageMoney(user.role);
    const todayLocal = DateTime.now().setZone(business.timezone);
    const todayDate = new Date(`${todayLocal.toISODate()}T00:00:00.000Z`);
    const dayOfWeek = todayLocal.weekday % 7;

    const where: Prisma.StaffWhereInput = { businessId: business.id };
    if (query.status === "active") where.isActive = true;
    if (query.status === "inactive") where.isActive = false;
    if (query.role) where.role = query.role;
    if (query.serviceId) where.serviceStaff = { some: { serviceId: query.serviceId } };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { jobTitle: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ];
    }
    if (query.availableToday) {
      where.isActive = true;
      where.availability = { some: { dayOfWeek } };
      where.timeOff = {
        none: { startsOn: { lte: todayDate }, endsOn: { gte: todayDate } },
      };
    }

    const skip = (query.page - 1) * query.perPage;
    const [members, total, serviceOptions, metricRows] = await Promise.all([
      prisma.staff.findMany({
        where,
        skip,
        take: query.perPage,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          role: true,
          jobTitle: true,
          yearsExperience: true,
          bio: true,
          phone: true,
          email: true,
          photoUrl: true,
          isActive: true,
          updatedAt: true,
          availability: {
            select: { dayOfWeek: true },
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          },
          timeOff: {
            where: { startsOn: { lte: todayDate }, endsOn: { gte: todayDate } },
            orderBy: { endsOn: "desc" },
            take: 1,
            select: { id: true, type: true, label: true, startsOn: true, endsOn: true },
          },
          serviceStaff: {
            orderBy: { service: { name: "asc" } },
            select: {
              commissionType: true,
              commissionAmount: true,
              service: { select: { id: true, name: true, category: true, isActive: true } },
            },
          },
        },
      }),
      prisma.staff.count({ where }),
      prisma.service.findMany({
        where: { businessId: business.id },
        select: { id: true, name: true, category: true, isActive: true },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
      prisma.$queryRaw<StaffMetricsRow[]>(Prisma.sql`
        SELECT
          COUNT(*)::bigint AS "total",
          COUNT(*) FILTER (WHERE s."is_active")::bigint AS "active",
          COUNT(*) FILTER (
            WHERE s."is_active"
              AND EXISTS (
                SELECT 1
                FROM "availability" a
                WHERE a."staff_id" = s."id"
                  AND a."day_of_week" = ${dayOfWeek}
              )
              AND NOT EXISTS (
                SELECT 1
                FROM "staff_time_off" t
                WHERE t."staff_id" = s."id"
                  AND t."starts_on" <= CAST(${todayDate} AS date)
                  AND t."ends_on" >= CAST(${todayDate} AS date)
              )
          )::bigint AS "availableToday",
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM "staff_time_off" t
              WHERE t."staff_id" = s."id"
                AND t."starts_on" <= CAST(${todayDate} AS date)
                AND t."ends_on" >= CAST(${todayDate} AS date)
            )
          )::bigint AS "onTimeOff"
        FROM "staff" s
        WHERE s."business_id" = CAST(${business.id} AS uuid)
      `),
    ]);

    const metrics = metricRows[0];
    const items = members.map((member) => {
      const currentTimeOff = member.timeOff[0] ?? null;
      const worksToday = member.availability.some((entry) => entry.dayOfWeek === dayOfWeek);
      return {
        id: member.id,
        name: member.name,
        role: member.role,
        jobTitle: member.jobTitle,
        yearsExperience: member.yearsExperience,
        bio: member.bio,
        phone: member.phone,
        email: member.email,
        photoUrl: member.photoUrl,
        isActive: member.isActive,
        availableToday: member.isActive && worksToday && !currentTimeOff,
        workingDays: [...new Set(member.availability.map((entry) => entry.dayOfWeek))],
        currentTimeOff: currentTimeOff
          ? {
              ...currentTimeOff,
              startsOn: dateOnly(currentTimeOff.startsOn),
              endsOn: dateOnly(currentTimeOff.endsOn),
            }
          : null,
        services: member.serviceStaff.map((relation) => ({
          ...relation.service,
          ...(ownerView
            ? {
                commissionType: relation.commissionType,
                commissionAmount: Number(relation.commissionAmount),
              }
            : {}),
        })),
        updatedAt: member.updatedAt,
      };
    });

    return {
      items,
      total,
      page: query.page,
      perPage: query.perPage,
      metrics: {
        total: numberFromCount(metrics?.total),
        active: numberFromCount(metrics?.active),
        availableToday: numberFromCount(metrics?.availableToday),
        onTimeOff: numberFromCount(metrics?.onTimeOff),
      },
      serviceOptions,
      canManageMoney: ownerView,
      canManageProtectedFields: ownerView,
    };
  }

  getWorkspace(staffId: string, user: AuthUser) {
    return staffWorkspaceService.getWorkspace(staffId, user);
  }

  listByBusiness(businessId: string, page?: number, perPage?: number) {
    return staffService.listByBusiness(businessId, page, perPage);
  }

  getServiceStaff(staffId: string, serviceId: string) {
    return staffService.getServiceStaff(staffId, serviceId);
  }

  getAvailability(staffId: string) {
    return staffService.getAvailability(staffId);
  }

  listAvailabilityOverridesForDate(staffId: string, date: string) {
    return staffService.listAvailabilityOverridesForDate(staffId, date);
  }

  getCommission(staffId: string, businessId: string, from?: string, to?: string) {
    return staffService.getCommission(staffId, businessId, from, to);
  }

  listStaffBreaksForDate(businessId: string, date: string) {
    return staffService.listStaffBreaksForDate(businessId, date);
  }

  async countUpcomingForStaff(staffId: string, businessId: string) {
    return prisma.appointmentService.count({
      where: {
        staffId,
        endsAt: { gt: new Date() },
        appointment: { businessId, status: { in: ACTIVE_APPOINTMENT_STATUSES } },
      },
    });
  }
}

export default new StaffQueryService();