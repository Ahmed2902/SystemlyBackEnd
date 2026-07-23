import {
  AppointmentStatus,
  CommissionType,
  Prisma,
  Roles,
} from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "../../shared/db/prisma";
import { timeOfDayToDate } from "../../shared/utils/timezone";
import type {
  AvailabilityEntry,
  StaffBreakInput,
  StaffCreateInput,
  StaffDirectoryQuery,
  StaffTimeOffInput,
  StaffUpdateInput,
} from "./staff.schema";

type AuthUser = NonNullable<Express.Request["user"]>;

const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.pending,
  AppointmentStatus.confirmed,
  AppointmentStatus.in_progress,
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

const canManageMoney = (role?: string) =>
  role === Roles.BusinessAdmin || role === Roles.SuperAdmin;

const canManageProtectedStaffFields = canManageMoney;

const cleanOptional = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed || null;
};

const timeLabel = (value: Date) => value.toISOString().slice(11, 16);
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

class StaffWorkspaceService {
  async listDirectory(user: AuthUser, query: StaffDirectoryQuery) {
    const { businessId, timezone } = await this.getBusinessContext(user);
    const ownerView = canManageMoney(user.role);
    const todayLocal = DateTime.now().setZone(timezone);
    const todayDate = new Date(`${todayLocal.toISODate()}T00:00:00.000Z`);
    const dayOfWeek = todayLocal.weekday % 7;

    const where: Prisma.StaffWhereInput = { businessId };
    if (query.status === "active") where.isActive = true;
    if (query.status === "inactive") where.isActive = false;
    if (query.role) where.role = query.role;
    if (query.serviceId) {
      where.serviceStaff = { some: { serviceId: query.serviceId } };
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { jobTitle: { contains: query.search, mode: "insensitive" } },
        { phone: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [staff, serviceOptions] = await Promise.all([
      prisma.staff.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        include: {
          availability: {
            select: { dayOfWeek: true, startTime: true, endTime: true },
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          },
          timeOff: {
            where: { startsOn: { lte: todayDate }, endsOn: { gte: todayDate } },
            orderBy: { endsOn: "desc" },
            take: 1,
          },
          serviceStaff: {
            orderBy: { service: { name: "asc" } },
            include: {
              service: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                  isActive: true,
                  priceEgp: true,
                },
              },
            },
          },
        },
      }),
      prisma.service.findMany({
        where: { businessId },
        select: { id: true, name: true, category: true, isActive: true },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
    ]);

    const mapped = staff.map((member) => {
      const currentTimeOff = member.timeOff[0] ?? null;
      const worksToday = member.availability.some(
        (entry) => entry.dayOfWeek === dayOfWeek,
      );
      const availableToday = member.isActive && worksToday && !currentTimeOff;

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
        availableToday,
        workingDays: [...new Set(member.availability.map((entry) => entry.dayOfWeek))],
        currentTimeOff: currentTimeOff
          ? {
              id: currentTimeOff.id,
              type: currentTimeOff.type,
              label: currentTimeOff.label,
              startsOn: dateOnly(currentTimeOff.startsOn),
              endsOn: dateOnly(currentTimeOff.endsOn),
            }
          : null,
        services: member.serviceStaff.map((relation) => ({
          id: relation.service.id,
          name: relation.service.name,
          category: relation.service.category,
          isActive: relation.service.isActive,
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

    const filtered = query.availableToday
      ? mapped.filter((member) => member.availableToday)
      : mapped;

    filtered.sort((left, right) => {
      const rank = (member: (typeof filtered)[number]) => {
        if (!member.isActive) return 3;
        if (member.currentTimeOff) return 2;
        if (member.availableToday) return 0;
        return 1;
      };
      return rank(left) - rank(right) || left.name.localeCompare(right.name);
    });

    const start = (query.page - 1) * query.perPage;
    const items = filtered.slice(start, start + query.perPage);

    return {
      items,
      total: filtered.length,
      page: query.page,
      perPage: query.perPage,
      metrics: {
        total: mapped.length,
        active: mapped.filter((member) => member.isActive).length,
        availableToday: mapped.filter((member) => member.availableToday).length,
        onTimeOff: mapped.filter((member) => Boolean(member.currentTimeOff)).length,
      },
      serviceOptions,
      canManageMoney: ownerView,
      canManageProtectedFields: canManageProtectedStaffFields(user.role),
    };
  }

  async getWorkspace(staffId: string, user: AuthUser) {
    const { businessId, timezone } = await this.getBusinessContext(user);
    const ownerView = canManageMoney(user.role);
    const now = new Date();
    const todayLocal = DateTime.now().setZone(timezone);
    const todayDate = new Date(`${todayLocal.toISODate()}T00:00:00.000Z`);

    const [member, upcomingAppointments, serviceOptions] = await Promise.all([
      prisma.staff.findFirst({
        where: { id: staffId, businessId },
        include: {
          availability: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
          availabilityOverrides: {
            where: { overrideDate: { gte: todayDate } },
            orderBy: { overrideDate: "asc" },
            take: 60,
          },
          staffBreaks: {
            where: { breakDate: { gte: todayDate } },
            orderBy: [{ breakDate: "asc" }, { startTime: "asc" }],
            take: 100,
          },
          timeOff: {
            where: { endsOn: { gte: todayDate } },
            orderBy: { startsOn: "asc" },
          },
          serviceStaff: {
            orderBy: { service: { name: "asc" } },
            include: {
              service: {
                select: {
                  id: true,
                  name: true,
                  category: true,
                  durationMin: true,
                  priceEgp: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
      prisma.appointmentService.findMany({
        where: {
          staffId,
          startsAt: { gte: now },
          appointment: { businessId, status: { in: ACTIVE_APPOINTMENT_STATUSES } },
        },
        orderBy: { startsAt: "asc" },
        take: 20,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          service: { select: { id: true, name: true } },
          appointment: {
            select: {
              id: true,
              status: true,
              customer: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      }),
      prisma.service.findMany({
        where: { businessId },
        select: {
          id: true,
          name: true,
          category: true,
          durationMin: true,
          priceEgp: true,
          isActive: true,
        },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
    ]);

    if (!member) throw buildError("Staff member not found", 404, "NOT_FOUND");

    return {
      staff: {
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
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
      },
      services: member.serviceStaff.map((relation) => ({
        id: relation.service.id,
        name: relation.service.name,
        category: relation.service.category,
        durationMin: relation.service.durationMin,
        isActive: relation.service.isActive,
        ...(ownerView
          ? {
              priceEgp: Number(relation.service.priceEgp),
              commissionType: relation.commissionType,
              commissionAmount: Number(relation.commissionAmount),
            }
          : {}),
      })),
      availability: member.availability.map((entry) => ({
        id: entry.id,
        dayOfWeek: entry.dayOfWeek,
        startTime: timeLabel(entry.startTime),
        endTime: timeLabel(entry.endTime),
        breakAfterMin: entry.breakAfterMin,
      })),
      overrides: member.availabilityOverrides.map((entry) => ({
        id: entry.id,
        overrideDate: dateOnly(entry.overrideDate),
        isDayOff: entry.isDayOff,
        startTime: entry.startTime ? timeLabel(entry.startTime) : null,
        endTime: entry.endTime ? timeLabel(entry.endTime) : null,
      })),
      breaks: member.staffBreaks.map((entry) => ({
        id: entry.id,
        breakDate: dateOnly(entry.breakDate),
        startTime: timeLabel(entry.startTime),
        endTime: timeLabel(entry.endTime),
        label: entry.label,
      })),
      timeOff: member.timeOff.map((entry) => ({
        id: entry.id,
        startsOn: dateOnly(entry.startsOn),
        endsOn: dateOnly(entry.endsOn),
        type: entry.type,
        label: entry.label,
        notes: entry.notes,
      })),
      upcomingAppointments: upcomingAppointments.map((segment) => ({
        segmentId: segment.id,
        appointmentId: segment.appointment.id,
        status: segment.appointment.status,
        startsAt: segment.startsAt,
        endsAt: segment.endsAt,
        service: segment.service,
        customer: segment.appointment.customer,
      })),
      serviceOptions: serviceOptions.map((service) => ({
        ...service,
        priceEgp: ownerView ? Number(service.priceEgp) : undefined,
      })),
      canManageMoney: ownerView,
      canManageProtectedFields: canManageProtectedStaffFields(user.role),
    };
  }

  async createStaff(user: AuthUser, payload: StaffCreateInput) {
    const { businessId } = await this.getBusinessContext(user);
    await this.assertServicesBelongToBusiness(businessId, payload.serviceIds);

    const protectedAccess = canManageProtectedStaffFields(user.role);
    const { serviceIds, ...profile } = payload;

    return prisma.$transaction(async (tx) => {
      const member = await tx.staff.create({
        data: {
          businessId,
          name: profile.name,
          role: protectedAccess ? profile.role : Roles.Staff,
          jobTitle: cleanOptional(profile.jobTitle),
          yearsExperience: profile.yearsExperience ?? null,
          bio: cleanOptional(profile.bio),
          phone: cleanOptional(profile.phone),
          email: cleanOptional(profile.email),
          photoUrl: cleanOptional(profile.photoUrl),
          isActive: protectedAccess ? profile.isActive : true,
        },
      });

      if (serviceIds.length > 0) {
        await tx.serviceStaff.createMany({
          data: serviceIds.map((serviceId) => ({
            staffId: member.id,
            serviceId,
            commissionType: CommissionType.NONE,
            commissionAmount: 0,
          })),
        });
      }

      return member;
    });
  }

  async updateStaff(staffId: string, user: AuthUser, payload: StaffUpdateInput) {
    const { businessId } = await this.getBusinessContext(user);
    const existing = await this.getOwnedStaff(staffId, businessId);
    const protectedAccess = canManageProtectedStaffFields(user.role);

    if (!protectedAccess && (payload.role !== undefined || payload.isActive !== undefined)) {
      throw buildError(
        "Only the business owner can change staff roles or active status",
        403,
        "FORBIDDEN",
      );
    }

    if (payload.isActive === false && existing.isActive) {
      await this.assertNoFutureAppointments(staffId, businessId);
    }

    if (payload.serviceIds) {
      await this.assertServicesBelongToBusiness(businessId, payload.serviceIds);
    }

    const { serviceIds, ...fields } = payload;
    const data: Prisma.StaffUpdateInput = {
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.role !== undefined && { role: fields.role }),
      ...(fields.jobTitle !== undefined && { jobTitle: cleanOptional(fields.jobTitle) }),
      ...(fields.yearsExperience !== undefined && {
        yearsExperience: fields.yearsExperience,
      }),
      ...(fields.bio !== undefined && { bio: cleanOptional(fields.bio) }),
      ...(fields.phone !== undefined && { phone: cleanOptional(fields.phone) }),
      ...(fields.email !== undefined && { email: cleanOptional(fields.email) }),
      ...(fields.photoUrl !== undefined && { photoUrl: cleanOptional(fields.photoUrl) }),
      ...(fields.isActive !== undefined && { isActive: fields.isActive }),
    };

    return prisma.$transaction(async (tx) => {
      const member = await tx.staff.update({ where: { id: staffId }, data });

      if (serviceIds) {
        const uniqueIds = [...new Set(serviceIds)];
        await tx.serviceStaff.deleteMany({
          where: { staffId, serviceId: { notIn: uniqueIds } },
        });
        const current = await tx.serviceStaff.findMany({
          where: { staffId, serviceId: { in: uniqueIds } },
          select: { serviceId: true },
        });
        const currentIds = new Set(current.map((item) => item.serviceId));
        const missing = uniqueIds.filter((serviceId) => !currentIds.has(serviceId));
        if (missing.length > 0) {
          await tx.serviceStaff.createMany({
            data: missing.map((serviceId) => ({
              staffId,
              serviceId,
              commissionType: CommissionType.NONE,
              commissionAmount: 0,
            })),
          });
        }
      }

      return member;
    });
  }

  async deactivateStaff(staffId: string, user: AuthUser) {
    if (!canManageProtectedStaffFields(user.role)) {
      throw buildError("Only the business owner can deactivate staff", 403, "FORBIDDEN");
    }
    const { businessId } = await this.getBusinessContext(user);
    await this.getOwnedStaff(staffId, businessId);
    await this.assertNoFutureAppointments(staffId, businessId);
    await prisma.staff.update({ where: { id: staffId }, data: { isActive: false } });
    return { id: staffId, isActive: false };
  }

  async replaceAvailability(
    staffId: string,
    user: AuthUser,
    entries: AvailabilityEntry[],
  ) {
    const { businessId } = await this.getBusinessContext(user);
    await this.getOwnedStaff(staffId, businessId);

    const grouped = new Map<number, AvailabilityEntry[]>();
    for (const entry of entries) {
      const dayEntries = grouped.get(entry.dayOfWeek) ?? [];
      dayEntries.push(entry);
      grouped.set(entry.dayOfWeek, dayEntries);
    }
    for (const dayEntries of grouped.values()) {
      const sorted = [...dayEntries].sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].startTime < sorted[index - 1].endTime) {
          throw buildError(
            "Staff availability intervals cannot overlap",
            400,
            "OVERLAPPING_AVAILABILITY",
          );
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      await tx.availability.deleteMany({ where: { staffId } });
      if (entries.length > 0) {
        await tx.availability.createMany({
          data: entries.map((entry) => ({
            staffId,
            dayOfWeek: entry.dayOfWeek,
            startTime: timeOfDayToDate(entry.startTime),
            endTime: timeOfDayToDate(entry.endTime),
            breakAfterMin: entry.breakAfterMin ?? null,
          })),
        });
      }
      return { success: true };
    });
  }

  async createBreak(staffId: string, user: AuthUser, input: StaffBreakInput) {
    const { businessId } = await this.getBusinessContext(user);
    await this.getOwnedStaff(staffId, businessId);
    return prisma.staffBreak.create({
      data: {
        businessId,
        staffId,
        breakDate: new Date(`${input.breakDate}T00:00:00.000Z`),
        startTime: timeOfDayToDate(input.startTime),
        endTime: timeOfDayToDate(input.endTime),
        label: cleanOptional(input.label),
      },
    });
  }

  async deleteBreak(staffId: string, breakId: string, user: AuthUser) {
    const { businessId } = await this.getBusinessContext(user);
    const result = await prisma.staffBreak.deleteMany({
      where: { id: breakId, staffId, businessId },
    });
    if (result.count === 0) throw buildError("Break not found", 404, "NOT_FOUND");
    return { success: true };
  }

  async createTimeOff(staffId: string, user: AuthUser, input: StaffTimeOffInput) {
    const { businessId } = await this.getBusinessContext(user);
    await this.getOwnedStaff(staffId, businessId);
    const startsOn = new Date(`${input.startsOn}T00:00:00.000Z`);
    const endsOn = new Date(`${input.endsOn}T00:00:00.000Z`);

    const overlap = await prisma.staffTimeOff.findFirst({
      where: { staffId, businessId, startsOn: { lte: endsOn }, endsOn: { gte: startsOn } },
      select: { id: true },
    });
    if (overlap) {
      throw buildError("This time-off range overlaps an existing entry", 409, "CONFLICT");
    }

    return prisma.staffTimeOff.create({
      data: {
        staffId,
        businessId,
        startsOn,
        endsOn,
        type: input.type,
        label: cleanOptional(input.label),
        notes: cleanOptional(input.notes),
      },
    });
  }

  async deleteTimeOff(staffId: string, timeOffId: string, user: AuthUser) {
    const { businessId } = await this.getBusinessContext(user);
    const result = await prisma.staffTimeOff.deleteMany({
      where: { id: timeOffId, staffId, businessId },
    });
    if (result.count === 0) {
      throw buildError("Time-off entry not found", 404, "NOT_FOUND");
    }
    return { success: true };
  }

  private async getBusinessContext(user: AuthUser) {
    if (!user.businessId) throw buildError("Business id missing", 400, "BAD_REQUEST");
    const business = await prisma.business.findUnique({
      where: { id: user.businessId },
      select: { id: true, timezone: true },
    });
    if (!business) throw buildError("Business not found", 404, "NOT_FOUND");
    return { businessId: business.id, timezone: business.timezone };
  }

  private async getOwnedStaff(staffId: string, businessId: string) {
    const member = await prisma.staff.findFirst({
      where: { id: staffId, businessId },
      select: { id: true, isActive: true },
    });
    if (!member) throw buildError("Staff member not found", 404, "NOT_FOUND");
    return member;
  }

  private async assertServicesBelongToBusiness(
    businessId: string,
    serviceIds: string[],
  ) {
    if (serviceIds.length === 0) return;
    const uniqueIds = [...new Set(serviceIds)];
    const count = await prisma.service.count({
      where: { businessId, id: { in: uniqueIds } },
    });
    if (count !== uniqueIds.length) {
      throw buildError(
        "One or more selected services do not belong to this business",
        400,
        "INVALID_SERVICE_SELECTION",
      );
    }
  }

  private async assertNoFutureAppointments(staffId: string, businessId: string) {
    const futureCount = await prisma.appointmentService.count({
      where: {
        staffId,
        endsAt: { gt: new Date() },
        appointment: { businessId, status: { in: ACTIVE_APPOINTMENT_STATUSES } },
      },
    });
    if (futureCount > 0) {
      throw buildError(
        `This staff member has ${futureCount} upcoming appointment${futureCount === 1 ? "" : "s"}. Reassign or cancel them before deactivating the profile.`,
        409,
        "STAFF_HAS_UPCOMING_APPOINTMENTS",
      );
    }
  }
}

export default new StaffWorkspaceService();
