import { prisma } from "../../shared/db/prisma";
import { timeOfDayToDate } from "../../shared/utils/timezone";
import {
  confirmPublicImageUpload,
  createPublicImageUploadTicket,
  deletePublicMediaQuietly,
  getPublicMediaUrl,
  PUBLIC_MEDIA_LIMITS,
} from "../../shared/services/public-media.service";
import type {
  AssignServiceInput,
  AvailabilityEntry,
  AvailabilityOverrideInput,
  CreateInviteInput,
  StaffBreakInput,
  StaffCreateInput,
  StaffTimeOffInput,
  StaffUpdateInput,
  UpdateServiceStaffInput,
} from "./staff.schema";
import staffInviteService from "./staff-invite.service";
import staffWorkspaceService from "./staff.workspace.service";

type AuthUser = NonNullable<Express.Request["user"]>;

const buildError = (message: string, statusCode: number, code: string) => {
  const error = new Error(message) as Error & {
    statusCode: number;
    code: string;
  };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

function staffPhotoFolder(businessId: string, staffId: string) {
  return `businesses/${businessId}/staff/${staffId}`;
}

class StaffCommandService {
  createStaff(user: AuthUser, payload: StaffCreateInput) {
    return staffWorkspaceService.createStaff(user, payload);
  }

  updateStaff(staffId: string, user: AuthUser, payload: StaffUpdateInput) {
    return staffWorkspaceService.updateStaff(staffId, user, payload);
  }

  deactivateStaff(staffId: string, user: AuthUser) {
    return staffWorkspaceService.deactivateStaff(staffId, user);
  }

  replaceAvailability(
    staffId: string,
    user: AuthUser,
    entries: AvailabilityEntry[],
  ) {
    return staffWorkspaceService.replaceAvailability(staffId, user, entries);
  }

  createBreak(staffId: string, user: AuthUser, input: StaffBreakInput) {
    return staffWorkspaceService.createBreak(staffId, user, input);
  }

  deleteBreak(staffId: string, breakId: string, user: AuthUser) {
    return staffWorkspaceService.deleteBreak(staffId, breakId, user);
  }

  createTimeOff(staffId: string, user: AuthUser, input: StaffTimeOffInput) {
    return staffWorkspaceService.createTimeOff(staffId, user, input);
  }

  deleteTimeOff(staffId: string, timeOffId: string, user: AuthUser) {
    return staffWorkspaceService.deleteTimeOff(staffId, timeOffId, user);
  }

  async assignService(
    staffId: string,
    businessId: string,
    payload: AssignServiceInput,
  ) {
    await Promise.all([
      this.assertOwnedStaff(staffId, businessId),
      this.assertOwnedService(payload.serviceId, businessId),
    ]);

    return prisma.serviceStaff.create({
      data: {
        staffId,
        serviceId: payload.serviceId,
        commissionType: payload.commissionType,
        commissionAmount: payload.commissionAmount,
      },
      include: {
        service: { select: { id: true, name: true, priceEgp: true } },
        staff: { select: { id: true, name: true } },
      },
    });
  }

  async updateServiceStaff(
    staffId: string,
    serviceId: string,
    businessId: string,
    payload: UpdateServiceStaffInput,
  ) {
    await this.assertOwnedServiceStaff(staffId, serviceId, businessId);

    return prisma.serviceStaff.update({
      where: { serviceId_staffId: { serviceId, staffId } },
      data: {
        commissionType: payload.commissionType,
        commissionAmount: payload.commissionAmount,
      },
      include: {
        service: { select: { id: true, name: true, priceEgp: true } },
        staff: { select: { id: true, name: true } },
      },
    });
  }

  async unassignService(
    staffId: string,
    serviceId: string,
    businessId: string,
  ) {
    await this.assertOwnedServiceStaff(staffId, serviceId, businessId);
    return prisma.serviceStaff.delete({
      where: { serviceId_staffId: { serviceId, staffId } },
    });
  }

  async addOverride(
    staffId: string,
    businessId: string,
    payload: AvailabilityOverrideInput,
  ) {
    await this.assertOwnedStaff(staffId, businessId);
    return prisma.availabilityOverride.create({
      data: {
        staffId,
        overrideDate: new Date(payload.overrideDate),
        isDayOff: payload.isDayOff ?? false,
        startTime: payload.startTime
          ? timeOfDayToDate(payload.startTime)
          : null,
        endTime: payload.endTime ? timeOfDayToDate(payload.endTime) : null,
      },
    });
  }

  async deleteOverride(overrideId: string, businessId: string) {
    const override = await prisma.availabilityOverride.findFirst({
      where: { id: overrideId, staff: { businessId } },
      select: { id: true },
    });
    if (!override) {
      throw buildError("Availability override not found", 404, "NOT_FOUND");
    }
    await prisma.availabilityOverride.delete({ where: { id: override.id } });
    return { success: true };
  }

  createInvite(businessId: string, input: CreateInviteInput) {
    return staffInviteService.create(businessId, input);
  }

  acceptInvite(token: string, userId: string) {
    return staffInviteService.accept(token, userId);
  }

  async createStaffBreak(
    businessId: string,
    payload: {
      staffId: string;
      breakDate: string;
      startTime: string;
      endTime: string;
      label?: string;
    },
  ) {
    await this.assertOwnedStaff(payload.staffId, businessId);
    return prisma.staffBreak.create({
      data: {
        businessId,
        staffId: payload.staffId,
        breakDate: new Date(`${payload.breakDate}T00:00:00.000Z`),
        startTime: timeOfDayToDate(payload.startTime),
        endTime: timeOfDayToDate(payload.endTime),
        label: payload.label,
      },
    });
  }

  async removeStaffBreak(businessId: string, breakId: string) {
    const deleted = await prisma.staffBreak.deleteMany({
      where: { id: breakId, businessId },
    });
    if (deleted.count !== 1) {
      throw buildError("Break not found", 404, "NOT_FOUND");
    }
    return { success: true };
  }

  async presignPhoto(
    staffId: string,
    businessId: string,
    contentType: string,
  ) {
    await this.assertOwnedStaff(staffId, businessId);

    const ticket = await createPublicImageUploadTicket({
      folder: staffPhotoFolder(businessId, staffId),
      contentType,
      maxBytes: PUBLIC_MEDIA_LIMITS.staffBytes,
    });
    return {
      ...ticket,
      publicId: ticket.objectPath,
      publicUrl: getPublicMediaUrl(ticket.objectPath),
    };
  }

  async confirmPhoto(
    staffId: string,
    businessId: string,
    objectPath: string,
    _ignoredClientUrl?: string,
  ) {
    await this.assertOwnedStaff(staffId, businessId);

    const uploaded = await confirmPublicImageUpload({
      folder: staffPhotoFolder(businessId, staffId),
      objectPath,
      maxBytes: PUBLIC_MEDIA_LIMITS.staffBytes,
    });
    const previous = await prisma.photo.findMany({
      where: { businessId, kind: "staff", type: staffId },
      select: { publicId: true },
    });

    try {
      const result = await prisma.$transaction(async (tx) => {
        await tx.photo.deleteMany({
          where: { businessId, kind: "staff", type: staffId },
        });
        const photo = await tx.photo.create({
          data: {
            businessId,
            url: uploaded.publicUrl,
            publicId: uploaded.objectPath,
            kind: "staff",
            type: staffId,
          },
        });
        const updated = await tx.staff.update({
          where: { id: staffId },
          data: { photoUrl: uploaded.publicUrl },
          select: { id: true, photoUrl: true },
        });
        return { photo, staff: updated };
      });

      await Promise.all(
        previous
          .map((photo) => photo.publicId)
          .filter((value): value is string => Boolean(value))
          .map(deletePublicMediaQuietly),
      );
      return result;
    } catch (error) {
      await deletePublicMediaQuietly(uploaded.objectPath);
      throw error;
    }
  }

  async removePhoto(staffId: string, businessId: string) {
    await this.assertOwnedStaff(staffId, businessId);

    const photos = await prisma.photo.findMany({
      where: { businessId, kind: "staff", type: staffId },
      select: { publicId: true },
    });

    await prisma.$transaction([
      prisma.staff.update({
        where: { id: staffId },
        data: { photoUrl: null },
      }),
      prisma.photo.deleteMany({
        where: { businessId, kind: "staff", type: staffId },
      }),
    ]);

    await Promise.all(
      photos
        .map((photo) => photo.publicId)
        .filter((value): value is string => Boolean(value))
        .map(deletePublicMediaQuietly),
    );

    return { id: staffId, photoUrl: null };
  }

  private async assertOwnedStaff(staffId: string, businessId: string) {
    const staff = await prisma.staff.findFirst({
      where: { id: staffId, businessId },
      select: { id: true },
    });
    if (!staff) throw buildError("Staff member not found", 404, "NOT_FOUND");
  }

  private async assertOwnedService(serviceId: string, businessId: string) {
    const service = await prisma.service.findFirst({
      where: { id: serviceId, businessId },
      select: { id: true },
    });
    if (!service) throw buildError("Service not found", 404, "NOT_FOUND");
  }

  private async assertOwnedServiceStaff(
    staffId: string,
    serviceId: string,
    businessId: string,
  ) {
    const relation = await prisma.serviceStaff.findFirst({
      where: {
        staffId,
        serviceId,
        staff: { businessId },
        service: { businessId },
      },
      select: { staffId: true },
    });
    if (!relation) {
      throw buildError("Service-staff relation not found", 404, "NOT_FOUND");
    }
  }
}

export default new StaffCommandService();
