import {
  AppointmentStatus,
  CommissionType,
  Prisma,
  Roles,
} from "@prisma/client";
import { DateTime } from "luxon";
import { getCachedBusinessTimezone } from "../calendar/calendar.query.service";
import { prisma } from "../../shared/db/prisma";
import { resolveOperationalBranch } from "../../shared/services/branch-context.service";
import { timeOfDayToDate } from "../../shared/utils/timezone";
import type {
  AvailabilityEntry,
  StaffBreakInput,
  StaffCreateInput,
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

const cleanOptional = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed || null;
};

const timeLabel = (value: Date) => value.toISOString().slice(11, 16);
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

class StaffWorkspaceService {
  private async resolveStaffScope(staffId: string, user: AuthUser) {
    if (!user.businessId) {
      throw buildError("Business id missing", 400, "BAD_REQUEST");
    }
    const member = await prisma.staff.findFirst({
      where: { id: staffId, businessId: user.businessId },
      select: { id: true, branchId: true, isActive: true },
    });
    if (!member?.branchId) {
      throw buildError("Staff member not found", 404, "NOT_FOUND");
    }
    const scope = await resolveOperationalBranch(user, member.branchId);
    return { member, ...scope };
  }

  private async assertServicesBelongToBranch(
    businessId: string,
    branchId: string,
    serviceIds: string[],
  ) {
    const uniqueIds = [...new Set(serviceIds)];
    if (uniqueIds.length === 0) return;
    const count = await prisma.service.count({
      where: {
        id: { in: uniqueIds },
        businessId,
        branchId,
      },
    });
    if (count !== uniqueIds.length) {
      throw buildError(
        "One or more selected services do not belong to this branch",
        400,
        "INVALID_SERVICE_SELECTION",
      );
    }
  }

  async getWorkspace(staffId: string, user: AuthUser) {
    const scope = await this.resolveStaffScope(staffId, user);
    const timezone = await getCachedBusinessTimezone(scope.businessId);
    const ownerView = canManageMoney(user.role);
    const now = new Date();
    const todayLocal = DateTime.now().setZone(timezone);
    const todayDate = new Date(`${todayLocal.toISODate()}T00:00:00.000Z`);

    const [member, upcomingAppointments, serviceOptions] = await Promise.all([
      prisma.staff.findFirst({
        where: {
          id: staffId,
          businessId: scope.businessId,
          branchId: scope.branchId,
        },
        include: {
          availability: {
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
          },
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
          appointment: {
            businessId: scope.businessId,
            branchId: scope.branchId,
            status: { in: ACTIVE_APPOINTMENT_STATUSES },
          },
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
        where: { businessId: scope.businessId, branchId: scope.branchId },
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
      branchId: scope.branchId,
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
      canManageProtectedFields: ownerView,
    };
  }

  async createStaff(user: AuthUser, payload: StaffCreateInput) {
    const scope = await resolveOperationalBranch(user, payload.branchId);
    const { branchId: _branchId, serviceIds, ...profile } = payload;
    await this.assertServicesBelongToBranch(
      scope.businessId,
      scope.branchId,
      serviceIds,
    );

    return prisma.$transaction(async (tx) => {
      const member = await tx.staff.create({
        data: {
          businessId: scope.businessId,
          branchId: scope.branchId,
          name: profile.name,
          role: profile.role,
          jobTitle: cleanOptional(profile.jobTitle),
          yearsExperience: profile.yearsExperience ?? null,
          bio: cleanOptional(profile.bio),
          phone: cleanOptional(profile.phone),
          email: cleanOptional(profile.email),
          photoUrl: cleanOptional(profile.photoUrl),
          isActive: profile.isActive,
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
    const scope = await this.resolveStaffScope(staffId, user);

    if (payload.isActive === false && scope.member.isActive) {
      await this.assertNoFutureAppointments(staffId, scope.businessId);
    }

    const { serviceIds, ...fields } = payload;
    if (serviceIds) {
      await this.assertServicesBelongToBranch(
        scope.businessId,
        scope.branchId,
        serviceIds,
      );
    }
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
    const scope = await this.resolveStaffScope(staffId, user);
    await this.assertNoFutureAppointments(staffId, scope.businessId);
    await prisma.staff.update({ where: { id: staffId }, data: { isActive: false } });
    return { id: staffId, isActive: false };
  }

  async replaceAvailability(
    staffId: string,
    user: AuthUser,
    entries: AvailabilityEntry[],
  ) {
    await this.resolveStaffScope(staffId, user);
    const grouped = new Map<number, AvailabilityEntry[]>();
    for (const entry of entries) {
      const dayEntries = grouped.get(entry.dayOfWeek) ?? [];
      dayEntries.push(entry);
      grouped.set(entry.dayOfWeek, dayEntries);
    }

    for (const dayEntries of grouped.values()) {
      const sorted = [...dayEntries].sort((left, right) =>
        left.startTime.localeCompare(right.startTime),
      );
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
    const scope = await this.resolveStaffScope(staffId, user);
    return prisma.staffBreak.create({
      data: {
        businessId: scope.businessId,
        staffId,
        breakDate: new Date(`${input.breakDate}T00:00:00.000Z`),
        startTime: timeOfDayToDate(input.startTime),
        endTime: timeOfDayToDate(input.endTime),
        label: cleanOptional(input.label),
      },
    });
  }

  async deleteBreak(staffId: string, breakId: string, user: AuthUser) {
    await this.resolveStaffScope(staffId, user);
    const deleted = await prisma.staffBreak.deleteMany({
      where: { id: breakId, staffId },
    });
    if (deleted.count !== 1) throw buildError("Break not found", 404, "NOT_FOUND");
    return { success: true };
  }

  async createTimeOff(staffId: string, user: AuthUser, input: StaffTimeOffInput) {
    const scope = await this.resolveStaffScope(staffId, user);
    const startsOn = new Date(`${input.startsOn}T00:00:00.000Z`);
    const endsOn = new Date(`${input.endsOn}T00:00:00.000Z`);

    const overlap = await prisma.staffTimeOff.findFirst({
      where: {
        staffId,
        startsOn: { lte: endsOn },
        endsOn: { gte: startsOn },
      },
      select: { id: true },
    });
    if (overlap) {
      throw buildError(
        "This time-off range overlaps an existing entry",
        409,
        "CONFLICT",
      );
    }

    return prisma.staffTimeOff.create({
      data: {
        staffId,
        businessId: scope.businessId,
        startsOn,
        endsOn,
        type: input.type,
        label: cleanOptional(input.label),
        notes: cleanOptional(input.notes),
      },
    });
  }

  async deleteTimeOff(staffId: string, timeOffId: string, user: AuthUser) {
    await this.resolveStaffScope(staffId, user);
    const deleted = await prisma.staffTimeOff.deleteMany({
      where: { id: timeOffId, staffId },
    });
    if (deleted.count !== 1) {
      throw buildError("Time off not found", 404, "NOT_FOUND");
    }
    return { success: true };
  }

  private async assertNoFutureAppointments(staffId: string, businessId: string) {
    const futureCount = await prisma.appointmentService.count({
      where: {
        staffId,
        endsAt: { gt: new Date() },
        appointment: {
          businessId,
          status: { in: ACTIVE_APPOINTMENT_STATUSES },
        },
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
